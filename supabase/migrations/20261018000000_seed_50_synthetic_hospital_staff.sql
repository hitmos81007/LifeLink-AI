-- ==============================================================================
-- Migration: 20261018000000_seed_50_synthetic_hospital_staff.sql
-- Description: Direct provisioning of 50 active synthetic hospital staff accounts
-- Range: vh16001@velhightech.com to vh16050@velhightech.com
-- Standard Password: Mats@8905
-- Target: Active Hospital Command Center (LL-DEMO-HOSP-01 / primary hospital)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_hospital_id UUID;
  v_admin_id UUID;
  v_auth_id UUID;
  v_staff_id UUID;
  v_index INTEGER;
  v_num INTEGER;
  v_email TEXT;
  v_name TEXT;
  v_dept TEXT;
  v_discipline TEXT;
  v_skills TEXT[];
  v_phone TEXT;
  v_encrypted_password TEXT;
  v_shift_start TIMESTAMPTZ;
  v_shift_end TIMESTAMPTZ;
  v_trigger_exists BOOLEAN;

  -- 50 realistic names
  v_names TEXT[] := ARRAY[
    'Dr. Rajesh Kumar', 'Dr. Priya Sharma', 'Dr. Ananya Iyer', 'Dr. Karthik Sundaram', 'Nurse Anitha R',
    'Nurse Suresh Babu', 'Dr. Vikramaditya Reddy', 'Nurse Kavitha M', 'Dr. Meenakshi Raman', 'Dr. Arjun Nair',
    'Nurse Deepa S', 'Technician Harish Verma', 'Dr. Sanjay Deshmukh', 'Nurse Lakshmi Narayanan', 'Dr. Pooja Kulkarni',
    'Nurse Gokul Prasad', 'Dr. Ritu Choudhury', 'Technician Manoj Kumar', 'Pharmacist Divya Menon', 'Dr. Balaji Govindan',
    'Nurse Preethi Pillai', 'Nurse Vigneshwaran S', 'Dr. Sneha Chatterjee', 'Dr. Alok Banerjee', 'Nurse Manjula B',
    'Technician Prakash Rao', 'Dr. Swaminathan V', 'Nurse Hemalatha K', 'Dr. Siddharth Sen', 'Nurse Naveen Raj',
    'Pharmacist Arvind Swamy', 'Dr. Neha Agarwal', 'Nurse Gayathri V', 'Dr. Mahesh Joshi', 'Technician Dinesh S',
    'Dr. Tanvi Bhatt', 'Nurse Pavithra S', 'Nurse Saravanan M', 'Dr. Rohini Varma', 'Technician Senthil Nathan',
    'Nurse Geetha Balan', 'Dr. Farooq Abdullah', 'Support Ravi Shankar', 'Support Murugan K', 'Nurse Revathi S',
    'Technician Ashok Pandey', 'Dr. Madhavan Kutty', 'Nurse Shalini Nair', 'Pharmacist Jayashree M', 'Support Velu P'
  ];

  -- 50 disciplines matching system constraints ('Nurse','Physician','Surgeon','Anesthesiologist','Respiratory Therapist','Pharmacist','Technician','Support','Other')
  v_disciplines TEXT[] := ARRAY[
    'Surgeon', 'Anesthesiologist', 'Physician', 'Surgeon', 'Nurse',
    'Nurse', 'Surgeon', 'Nurse', 'Physician', 'Anesthesiologist',
    'Nurse', 'Technician', 'Surgeon', 'Nurse', 'Physician',
    'Nurse', 'Anesthesiologist', 'Technician', 'Pharmacist', 'Physician',
    'Nurse', 'Nurse', 'Surgeon', 'Physician', 'Nurse',
    'Technician', 'Anesthesiologist', 'Nurse', 'Surgeon', 'Nurse',
    'Pharmacist', 'Physician', 'Nurse', 'Surgeon', 'Technician',
    'Physician', 'Nurse', 'Nurse', 'Anesthesiologist', 'Respiratory Therapist',
    'Nurse', 'Physician', 'Support', 'Support', 'Nurse',
    'Respiratory Therapist', 'Surgeon', 'Nurse', 'Pharmacist', 'Support'
  ];

  -- 50 departments
  v_depts TEXT[] := ARRAY[
    'Trauma Surgery', 'Anesthesiology', 'Critical Care (ICU)', 'Orthopedic Surgery', 'Emergency Ward',
    'ICU Care', 'General Surgery', 'Post-Op Recovery (PACU)', 'Internal Medicine', 'Cardiothoracic Anesthesia',
    'Emergency Care', 'Biomedical & Radiology', 'Neurosurgery', 'Pediatric ICU', 'General Medicine',
    'Operating Room Scrub', 'Neuro-Anesthesia', 'Sterilization & CSSD', 'Hospital Pharmacy', 'Pulmonology',
    'Step-Down Ward', 'Surgical Ward', 'Plastic & Reconstructive', 'Infectious Diseases', 'Day Care Ward',
    'Medical Gas & Plant', 'Obstetric Anesthesia', 'ICU Care', 'Cardiovascular Surgery', 'Emergency Ward',
    'Clinical Pharmacy', 'Nephrology & Dialysis', 'Triage Station', 'Surgical Oncology', 'Laboratory Diagnostics',
    'Endocrinology', 'Neonatal ICU', 'Orthopedic Ward', 'Pain Management', 'Respiratory Care',
    'Dialysis Ward', 'Gastroenterology', 'Logistics & Transport', 'Patient Sanitation', 'Pre-Op Holding',
    'Ventilator & Gas Unit', 'Pediatric Surgery', 'Cardiac Step-Down', 'Emergency Pharmacy', 'Waste & Biohazard'
  ];

BEGIN
  -- 1. Identify Target Hospital
  SELECT hospital_id INTO v_hospital_id
  FROM public.hospitals
  WHERE hospital_code = 'LL-DEMO-HOSP-01'
  LIMIT 1;

  IF v_hospital_id IS NULL THEN
    SELECT hospital_id INTO v_hospital_id
    FROM public.hospitals
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_hospital_id IS NULL THEN
    -- Fallback: create default demo hospital if missing
    v_hospital_id := 'a1000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO public.hospitals (
      hospital_id, hospital_name, hospital_code, address, district, state, latitude, longitude,
      hospital_type, trauma_center, status, verification_status
    ) VALUES (
      v_hospital_id, 'Vel High-Tech Super Speciality Hospital', 'LL-DEMO-HOSP-01',
      'Avadi-Vel Tech Road, Chennai', 'Chennai', 'Tamil Nadu', 13.1834, 80.0982,
      'Government', TRUE, 'Active', 'active'
    ) ON CONFLICT (hospital_code) DO NOTHING;
  END IF;

  -- 2. Identify Admin User for audit references
  SELECT user_id INTO v_admin_id
  FROM public.users
  WHERE role::text = 'hospital_admin' AND hospital_id = v_hospital_id
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT user_id INTO v_admin_id
    FROM public.users
    WHERE role::text = 'hospital_admin'
    LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    SELECT user_id INTO v_admin_id FROM public.users LIMIT 1;
  END IF;

  -- 3. Calculate bcrypt hash for password "Mats@8905"
  v_encrypted_password := extensions.crypt('Mats@8905', extensions.gen_salt('bf', 10));

  -- 4. Temporarily disable strict invite trigger on auth.users if present for direct seeding
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'aaa_prepare_hospital_staff_signup'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    ALTER TABLE auth.users DISABLE TRIGGER aaa_prepare_hospital_staff_signup;
  END IF;

  -- 5. Loop 1 to 50 for all synthetic staff
  FOR v_index IN 1..50 LOOP
    v_num := 16000 + v_index;
    v_email := 'vh' || v_num::text || '@velhightech.com';
    v_name := v_names[v_index];
    v_dept := v_depts[v_index];
    v_discipline := v_disciplines[v_index];
    v_phone := '+91 98401 ' || lpad((v_num % 10000)::text, 4, '0');
    v_skills := ARRAY['ACLS', 'Emergency Protocol', v_dept];

    -- A. Check or insert in auth.users
    SELECT id INTO v_auth_id
    FROM auth.users
    WHERE email = lower(v_email)
    LIMIT 1;

    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role,
        aud,
        created_at,
        updated_at
      ) VALUES (
        v_auth_id,
        '00000000-0000-0000-0000-000000000000'::uuid,
        lower(v_email),
        v_encrypted_password,
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', v_name, 'role', 'hospital_staff'),
        false,
        'authenticated',
        'authenticated',
        now(),
        now()
      );
    ELSE
      -- Update existing password to Mats@8905
      UPDATE auth.users
      SET encrypted_password = v_encrypted_password,
          updated_at = now()
      WHERE id = v_auth_id;
    END IF;

    -- B. Upsert in public.users
    INSERT INTO public.users (
      user_id,
      email,
      full_name,
      role,
      hospital_id,
      status,
      account_status,
      created_at,
      updated_at
    ) VALUES (
      v_auth_id,
      lower(v_email),
      v_name,
      'hospital_staff'::public.user_role,
      v_hospital_id,
      TRUE,
      'active',
      now(),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      role = 'hospital_staff'::public.user_role,
      hospital_id = EXCLUDED.hospital_id,
      status = TRUE,
      account_status = 'active',
      updated_at = now();

    -- C. Upsert in public.hospital_staff
    INSERT INTO public.hospital_staff (
      hospital_id,
      auth_user_id,
      full_name,
      email,
      phone,
      department,
      discipline,
      skills,
      contract_hours_per_week,
      employment_status,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_hospital_id,
      v_auth_id,
      v_name,
      lower(v_email),
      v_phone,
      v_dept,
      v_discipline,
      v_skills,
      40.00,
      'active',
      COALESCE(v_admin_id, v_auth_id),
      now() - (v_index || ' hours')::interval,
      now()
    )
    ON CONFLICT (hospital_id, lower(email)) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      department = EXCLUDED.department,
      discipline = EXCLUDED.discipline,
      skills = EXCLUDED.skills,
      employment_status = 'active',
      updated_at = now()
    RETURNING staff_id INTO v_staff_id;

    -- D. Seed 24-hour shift schedule for each staff
    v_shift_start := date_trunc('day', now()) + (((v_index % 3) * 8) || ' hours')::interval;
    v_shift_end := v_shift_start + interval '8 hours';

    INSERT INTO public.hospital_staff_shifts (
      staff_id,
      hospital_id,
      starts_at,
      ends_at,
      status,
      shift_note,
      created_by,
      created_at
    ) VALUES (
      v_staff_id,
      v_hospital_id,
      v_shift_start,
      v_shift_end,
      'confirmed',
      '24h Roster Assignment · Station: ' || v_dept,
      COALESCE(v_admin_id, v_auth_id),
      now()
    )
    ON CONFLICT DO NOTHING;

  END LOOP;

  -- 6. Re-enable trigger if it was disabled
  IF v_trigger_exists THEN
    ALTER TABLE auth.users ENABLE TRIGGER aaa_prepare_hospital_staff_signup;
  END IF;

  RAISE NOTICE 'Successfully seeded 50 active synthetic hospital staff accounts (vh16001-vh16050@velhightech.com) with standard password Mats@8905 into hospital %', v_hospital_id;

END $$;
