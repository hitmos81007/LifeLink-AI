-- ============================================================================
-- Batch 2 Migration 1: 20260818_batch2_atomic_signup_and_profile_authority.sql
-- 
-- Scope:
-- GAP-06: Database Ground Truth for Profile Authority & Provider Association
-- GAP-07: Atomic Signup Trigger with Provider Entity Provisioning
-- GAP-61: Elimination of Client-Side Role/Metadata Authorization
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Verify and Formalize Canonical public.user_role Enum
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Ensure ambulance_admin exists in user_role enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'ambulance_admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'ambulance_admin';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Verify Foreign Keys and Column Types on public.users
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Ensure hospital_id FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_hospital_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_hospital_id_fkey
      FOREIGN KEY (hospital_id) REFERENCES public.hospitals(hospital_id) ON DELETE SET NULL;
  END IF;

  -- Ensure blood_bank_id FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_blood_bank_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_blood_bank_id_fkey
      FOREIGN KEY (blood_bank_id) REFERENCES public.blood_banks(blood_bank_id) ON DELETE SET NULL;
  END IF;

  -- Ensure ambulance_provider_id FK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_ambulance_provider_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_ambulance_provider_id_fkey
      FOREIGN KEY (ambulance_provider_id) REFERENCES public.ambulance_providers(provider_id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Trusted Atomic Signup Trigger Function (GAP-07, GAP-61)
-- 
-- Rules:
-- 1. Evaluates raw_user_meta_data from auth.users insert.
-- 2. Rejects invalid, missing, or unapproved roles (e.g. clinician_reviewer, hospital_approver).
-- 3. Allowed public signup roles: patient, hospital_admin, blood_bank_admin, ambulance_admin, government_admin.
-- 4. Atomically creates provider entity for provider roles using database-generated UUIDs and unique codes.
-- 5. Creates public.users profile row with database-authoritative role and provider FK.
-- 6. Rolls back the entire transaction if any validation or insertion fails.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role_str TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_hospital_id UUID := NULL;
  v_blood_bank_id UUID := NULL;
  v_ambulance_provider_id UUID := NULL;
  
  -- Provider metadata fields
  v_hosp_name TEXT;
  v_hosp_address TEXT;
  v_district TEXT;
  v_state TEXT;
  v_hosp_type TEXT;
  v_trauma_center BOOLEAN;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_bb_name TEXT;
  v_bb_address TEXT;
  v_amb_name TEXT;
  v_code TEXT;
BEGIN
  -- Extract requested role from auth metadata
  v_role_str := LOWER(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', '')));

  -- Extract basic user profile metadata
  v_full_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  v_phone := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  IF v_full_name = '' THEN
    v_full_name := split_part(NEW.email, '@', 1);
  END IF;

  -- 1. Role Validation: Reject invalid, missing, or protected roles
  IF v_role_str NOT IN ('patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin', 'government_admin') THEN
    RAISE EXCEPTION 'Registration failed: Role "%" is not an authorized public signup role. Protected roles cannot be self-assigned.', v_role_str;
  END IF;

  -- 2. Role-Specific Provider Provisioning (Atomic Entity Creation)
  IF v_role_str = 'hospital_admin' THEN
    v_hosp_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'hospital_name', ''));
    v_hosp_address := TRIM(COALESCE(NEW.raw_user_meta_data->>'hospital_address', ''));
    v_district := TRIM(COALESCE(NEW.raw_user_meta_data->>'district', ''));
    v_state := TRIM(COALESCE(NEW.raw_user_meta_data->>'state', ''));
    v_hosp_type := TRIM(COALESCE(NEW.raw_user_meta_data->>'hospital_type', 'Government'));
    v_trauma_center := COALESCE((NEW.raw_user_meta_data->>'trauma_center')::BOOLEAN, false);
    
    IF v_hosp_name = '' OR v_hosp_address = '' OR v_district = '' OR v_state = '' THEN
      RAISE EXCEPTION 'Registration failed: Hospital Admin signup requires hospital_name, hospital_address, district, and state.';
    END IF;

    -- Validate optional coordinates
    BEGIN
      v_lat := (NEW.raw_user_meta_data->>'latitude')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_lat := NULL;
    END;

    BEGIN
      v_lng := (NEW.raw_user_meta_data->>'longitude')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_lng := NULL;
    END;

    -- Generate unique facility code
    v_code := 'HOSP-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));

    -- Atomically insert hospital entity
    INSERT INTO public.hospitals (
      hospital_name,
      hospital_code,
      address,
      district,
      state,
      latitude,
      longitude,
      phone,
      email,
      hospital_type,
      trauma_center,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_hosp_name,
      v_code,
      v_hosp_address,
      v_district,
      v_state,
      v_lat,
      v_lng,
      v_phone,
      NEW.email,
      v_hosp_type::public.hospital_type,
      v_trauma_center,
      'Active',
      NOW(),
      NOW()
    )
    RETURNING hospital_id INTO v_hospital_id;

    -- Initialize basic inventory records for the new hospital
    INSERT INTO public.icu_inventory (hospital_id, total_icu_beds, occupied_icu_beds, reserved_icu_beds, available_icu_beds, created_at, updated_at)
    VALUES (v_hospital_id, 10, 0, 0, 10, NOW(), NOW())
    ON CONFLICT DO NOTHING;

    INSERT INTO public.general_bed_inventory (hospital_id, total_beds, occupied_beds, reserved_beds, available_beds, created_at, updated_at)
    VALUES (v_hospital_id, 50, 0, 0, 50, NOW(), NOW())
    ON CONFLICT DO NOTHING;

    INSERT INTO public.oxygen_inventory (hospital_id, oxygen_type, total_capacity, available_capacity, minimum_threshold, unit, created_at, updated_at)
    VALUES (v_hospital_id, 'Cylinder', 100, 100, 20, 'Cylinders', NOW(), NOW())
    ON CONFLICT DO NOTHING;

  ELSIF v_role_str = 'blood_bank_admin' THEN
    v_bb_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'blood_bank_name', ''));
    v_bb_address := TRIM(COALESCE(NEW.raw_user_meta_data->>'blood_bank_address', ''));
    v_district := TRIM(COALESCE(NEW.raw_user_meta_data->>'district', ''));
    v_state := TRIM(COALESCE(NEW.raw_user_meta_data->>'state', ''));

    IF v_bb_name = '' OR v_bb_address = '' OR v_district = '' OR v_state = '' THEN
      RAISE EXCEPTION 'Registration failed: Blood Bank Admin signup requires blood_bank_name, blood_bank_address, district, and state.';
    END IF;

    BEGIN
      v_lat := (NEW.raw_user_meta_data->>'latitude')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_lat := NULL;
    END;

    BEGIN
      v_lng := (NEW.raw_user_meta_data->>'longitude')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_lng := NULL;
    END;

    v_code := 'BB-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));

    INSERT INTO public.blood_banks (
      blood_bank_name,
      blood_bank_code,
      address,
      district,
      state,
      latitude,
      longitude,
      phone,
      email,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_bb_name,
      v_code,
      v_bb_address,
      v_district,
      v_state,
      v_lat,
      v_lng,
      v_phone,
      NEW.email,
      'Active',
      NOW(),
      NOW()
    )
    RETURNING blood_bank_id INTO v_blood_bank_id;

  ELSIF v_role_str = 'ambulance_admin' THEN
    v_amb_name := TRIM(COALESCE(NEW.raw_user_meta_data->>'provider_name', ''));
    v_district := TRIM(COALESCE(NEW.raw_user_meta_data->>'district', ''));
    v_state := TRIM(COALESCE(NEW.raw_user_meta_data->>'state', ''));

    IF v_amb_name = '' OR v_district = '' OR v_state = '' THEN
      RAISE EXCEPTION 'Registration failed: Ambulance Admin signup requires provider_name, district, and state.';
    END IF;

    v_code := 'AMB-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));

    INSERT INTO public.ambulance_providers (
      provider_name,
      provider_code,
      district,
      state,
      phone,
      email,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_amb_name,
      v_code,
      v_district,
      v_state,
      v_phone,
      NEW.email,
      'Active',
      NOW(),
      NOW()
    )
    RETURNING provider_id INTO v_ambulance_provider_id;

  END IF;

  -- 3. Atomically Create Authoritative public.users Record
  INSERT INTO public.users (
    user_id,
    full_name,
    email,
    phone,
    role,
    hospital_id,
    blood_bank_id,
    ambulance_provider_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    NEW.email,
    v_phone,
    v_role_str::public.user_role,
    v_hospital_id,
    v_blood_bank_id,
    v_ambulance_provider_id,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    hospital_id = COALESCE(EXCLUDED.hospital_id, users.hospital_id),
    blood_bank_id = COALESCE(EXCLUDED.blood_bank_id, users.blood_bank_id),
    ambulance_provider_id = COALESCE(EXCLUDED.ambulance_provider_id, users.ambulance_provider_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Bind Trigger to auth.users
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permissions to postgres and service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;
