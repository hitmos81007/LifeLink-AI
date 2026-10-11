-- Rollback-only check for the first half of provider verification. A valid
-- fictional provider signup must create a pending account/facility, an audit
-- event, and no public-directory listing.
BEGIN;

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_hospital_id UUID;
  v_account_status TEXT;
  v_user_active BOOLEAN;
  v_provider_status TEXT;
  v_verification_status TEXT;
  v_directory JSONB;
  v_pending_events INTEGER;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at
  ) VALUES (
    v_user_id, 'authenticated', 'authenticated',
    'rollback-pending-provider-' || v_user_id::text || '@example.invalid', '',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'role', 'hospital_admin', 'full_name', 'Rollback Pending Provider Test',
      'hospital_name', 'Rollback Pending Provider Test Facility',
      'hospital_address', 'Synthetic Test Address', 'district', 'Demo District',
      'state', 'Demo State', 'hospital_type', 'Government', 'trauma_center', false
    ),
    now(), now(), now()
  );

  SELECT u.account_status, u.status, h.status, h.verification_status, h.hospital_id
    INTO v_account_status, v_user_active, v_provider_status, v_verification_status, v_hospital_id
  FROM public.users u JOIN public.hospitals h ON h.hospital_id = u.hospital_id
  WHERE u.user_id = v_user_id;
  IF v_account_status <> 'pending' OR v_user_active IS TRUE
     OR v_provider_status <> 'Inactive' OR v_verification_status <> 'pending'
     OR v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Provider signup did not create a pending, inactive facility account.';
  END IF;

  SELECT count(*) INTO v_pending_events FROM public.provider_account_reviews
  WHERE user_id = v_user_id AND action = 'pending' AND provider_id = v_hospital_id;
  IF v_pending_events <> 1 THEN RAISE EXCEPTION 'Provider signup did not append exactly one pending review event.'; END IF;

  SELECT public.get_public_resource_directory() INTO v_directory;
  IF v_directory->'hospitals' @> jsonb_build_array(jsonb_build_object('id', v_hospital_id)) THEN
    RAISE EXCEPTION 'Pending provider appeared in the public resource directory.';
  END IF;
  RAISE NOTICE 'PASS: new provider is pending, inactive, audited, and absent from public discovery.';
END;
$$;

ROLLBACK;
