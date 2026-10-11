-- Full rollback-only provider lifecycle check. Creates a fictional Auth account,
-- verifies it is hidden while pending, activates it through the platform review
-- RPC, verifies public visibility, then suspends it and verifies it is hidden.
-- The outer transaction is always rolled back; no account or facility persists.
BEGIN;

DO $$
DECLARE
  v_admin_id UUID;
  v_user_id UUID := gen_random_uuid();
  v_hospital_id UUID;
  v_directory JSONB;
  v_result JSONB;
  v_account_status TEXT;
  v_user_active BOOLEAN;
  v_provider_status TEXT;
  v_provider_verification TEXT;
  v_listed BOOLEAN;
  v_review_count INTEGER;
BEGIN
  SELECT user_id INTO v_admin_id
  FROM public.users
  WHERE role::text = 'platform_admin' AND status IS TRUE AND account_status = 'active'
  ORDER BY created_at
  LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No active platform-admin account is available for this verification.';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at
  ) VALUES (
    v_user_id, 'authenticated', 'authenticated',
    'rollback-provider-' || v_user_id::text || '@example.invalid', '',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'role', 'hospital_admin', 'full_name', 'Rollback Provider Review Test',
      'hospital_name', 'Rollback Provider Review Test Facility',
      'hospital_address', 'Synthetic Test Address', 'district', 'Demo District',
      'state', 'Demo State', 'hospital_type', 'Government', 'trauma_center', false
    ),
    now(), now(), now()
  );

  SELECT u.account_status, u.status, h.status, h.verification_status, h.hospital_id
    INTO v_account_status, v_user_active, v_provider_status, v_provider_verification, v_hospital_id
  FROM public.users u JOIN public.hospitals h ON h.hospital_id = u.hospital_id
  WHERE u.user_id = v_user_id;
  IF v_account_status <> 'pending' OR v_user_active IS TRUE
     OR v_provider_status <> 'Inactive' OR v_provider_verification <> 'pending'
     OR v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Provider signup did not remain pending and inactive.';
  END IF;

  SELECT public.get_public_resource_directory() INTO v_directory;
  IF v_directory->'hospitals' @> jsonb_build_array(jsonb_build_object('id', v_hospital_id)) THEN
    RAISE EXCEPTION 'Pending provider appeared in the public resource directory.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT EXISTS (SELECT 1 FROM public.list_provider_accounts_for_review() r WHERE r.user_id = v_user_id)
    INTO v_listed;
  IF NOT v_listed THEN RAISE EXCEPTION 'Pending provider was not visible in the admin review queue.'; END IF;

  v_result := public.review_provider_account(v_user_id, 'activate', 'Rollback-only provider approval verification.');
  IF v_result->>'account_status' <> 'active' OR (v_result->>'provider_id')::uuid <> v_hospital_id THEN
    RAISE EXCEPTION 'Provider approval RPC returned an unexpected result.';
  END IF;
  SELECT u.account_status, u.status, h.status, h.verification_status
    INTO v_account_status, v_user_active, v_provider_status, v_provider_verification
  FROM public.users u JOIN public.hospitals h ON h.hospital_id = u.hospital_id
  WHERE u.user_id = v_user_id;
  IF v_account_status <> 'active' OR v_user_active IS DISTINCT FROM TRUE
     OR v_provider_status <> 'Active' OR v_provider_verification <> 'active' THEN
    RAISE EXCEPTION 'Approved provider account and facility did not become active together.';
  END IF;
  SELECT public.get_public_resource_directory() INTO v_directory;
  IF NOT (v_directory->'hospitals' @> jsonb_build_array(jsonb_build_object('id', v_hospital_id))) THEN
    RAISE EXCEPTION 'Approved provider did not appear in the public resource directory.';
  END IF;

  PERFORM public.review_provider_account(v_user_id, 'suspend', 'Rollback-only provider suspension verification.');
  SELECT u.account_status, u.status, h.status, h.verification_status
    INTO v_account_status, v_user_active, v_provider_status, v_provider_verification
  FROM public.users u JOIN public.hospitals h ON h.hospital_id = u.hospital_id
  WHERE u.user_id = v_user_id;
  IF v_account_status <> 'suspended' OR v_user_active IS DISTINCT FROM FALSE
     OR v_provider_status <> 'Inactive' OR v_provider_verification <> 'suspended' THEN
    RAISE EXCEPTION 'Suspended provider account and facility did not become inactive together.';
  END IF;
  SELECT public.get_public_resource_directory() INTO v_directory;
  IF v_directory->'hospitals' @> jsonb_build_array(jsonb_build_object('id', v_hospital_id)) THEN
    RAISE EXCEPTION 'Suspended provider remained in the public resource directory.';
  END IF;

  SELECT count(*) INTO v_review_count FROM public.provider_account_reviews WHERE user_id = v_user_id;
  IF v_review_count <> 3 THEN RAISE EXCEPTION 'Expected pending, activated, and suspended review history events.'; END IF;
  RAISE NOTICE 'PASS: pending signup hidden; approval publishes; suspension hides; all changes are rollback-only.';
END;
$$;

ROLLBACK;
