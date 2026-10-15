-- Rollback-only fleet test using an active ambulance administrator.
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_provider_id UUID;
  v_created public.ambulances;
  v_updated public.ambulances;
  v_vehicle TEXT := 'LLV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_audit_count INTEGER;
  v_invalid_rejected BOOLEAN := FALSE;
  v_stale_rejected BOOLEAN := FALSE;
BEGIN
  SELECT u.user_id, u.ambulance_provider_id INTO v_user_id, v_provider_id
  FROM public.users u
  JOIN public.ambulance_providers ap ON ap.provider_id = u.ambulance_provider_id AND ap.status = 'Active'
  WHERE u.role::text = 'ambulance_admin' AND u.status IS TRUE AND u.account_status = 'active'
  ORDER BY u.created_at LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No active ambulance administrator/provider is available.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.create_ambulance(v_provider_id, v_vehicle, 'BLS', 'Synthetic verifier', NULL, 13.1, NULL, 'Available');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Ambulance vehicle, driver, phone, or coordinate values are invalid%' THEN
      v_invalid_rejected := TRUE;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_invalid_rejected THEN RAISE EXCEPTION 'Fleet RPC accepted a one-sided coordinate pair.'; END IF;

  SELECT * INTO v_created FROM public.create_ambulance(
    v_provider_id, v_vehicle, 'BLS', 'Synthetic verifier', NULL, 13.1, 80.2, 'Available'
  );
  IF v_created.provider_id <> v_provider_id OR v_created.vehicle_number <> v_vehicle
     OR v_created.current_latitude <> 13.1 OR v_created.current_longitude <> 80.2 THEN
    RAISE EXCEPTION 'Ambulance create returned unexpected fleet data.';
  END IF;

  SELECT * INTO v_updated FROM public.update_ambulance(
    v_created.ambulance_id, v_created.updated_at, 'ALS', 'Synthetic verifier updated', NULL,
    13.2, 80.3, 'Maintenance', NULL
  );
  IF v_updated.ambulance_type::text <> 'ALS' OR v_updated.driver_name <> 'Synthetic verifier updated'
     OR v_updated.status::text <> 'Maintenance' OR v_updated.provider_id <> v_provider_id THEN
    RAISE EXCEPTION 'Ambulance update returned unexpected fleet data.';
  END IF;

  BEGIN
    PERFORM public.update_ambulance(
      v_created.ambulance_id, v_created.updated_at - interval '1 second', 'BLS',
      'Stale verifier', NULL, 13.1, 80.2, 'Available', NULL
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_stale_rejected := TRUE;
  END;
  IF NOT v_stale_rejected THEN RAISE EXCEPTION 'Fleet RPC accepted a stale ambulance version.'; END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'ambulances'
    AND record_id = v_created.ambulance_id
    AND action IN ('AMBULANCE_CREATED', 'AMBULANCE_UPDATED');
  IF v_audit_count <> 2 THEN RAISE EXCEPTION 'Ambulance create/update were not both audited against the ambulance row ID.'; END IF;

  RAISE NOTICE 'PASS: provider ownership enforced; invalid coordinates and stale edits rejected; create/update audited.';
END;
$$;

ROLLBACK;
