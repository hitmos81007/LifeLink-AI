-- Rollback-only create/update check using an active blood bank administrator.
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_bank_id UUID;
  v_inventory_id UUID;
  v_group public.blood_group;
  v_available INTEGER;
  v_reserved INTEGER;
  v_expired INTEGER;
  v_minimum INTEGER;
  v_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_after public.blood_inventory;
  v_created public.blood_inventory;
  v_test_group public.blood_group;
  v_audit_count INTEGER;
  v_prior_audit_count INTEGER;
  v_invalid_rejected BOOLEAN := FALSE;
  v_stale_rejected BOOLEAN := FALSE;
BEGIN
  SELECT u.user_id, u.blood_bank_id, bi.inventory_id, bi.blood_group,
         bi.available_units, bi.reserved_units, bi.expired_units,
         bi.minimum_threshold, bi.updated_at
    INTO v_user_id, v_bank_id, v_inventory_id, v_group,
         v_available, v_reserved, v_expired, v_minimum, v_updated_at
  FROM public.users u
  JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id AND b.status = 'Active'
  JOIN public.blood_inventory bi ON bi.blood_bank_id = b.blood_bank_id
  WHERE u.role::text = 'blood_bank_admin' AND u.status IS TRUE AND u.account_status = 'active'
  ORDER BY u.created_at, bi.created_at
  LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No active blood bank administrator with inventory is available.'; END IF;
  SELECT bg::public.blood_group INTO v_test_group
  FROM unnest(enum_range(NULL::public.blood_group)) AS bg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.blood_inventory bi
    WHERE bi.blood_bank_id = v_bank_id AND bi.blood_group = bg::public.blood_group
  ) LIMIT 1;
  IF v_test_group IS NULL THEN RAISE EXCEPTION 'The selected bank already has every blood group; verifier needs one free synthetic group.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.save_blood_inventory(v_bank_id,v_group::text,-1,v_reserved,v_expired,v_minimum,NULL::timestamp without time zone,v_inventory_id,v_updated_at);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Blood stock must use a valid group%' THEN v_invalid_rejected := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_invalid_rejected THEN RAISE EXCEPTION 'Blood inventory RPC accepted negative stock.'; END IF;

  SELECT count(*) INTO v_prior_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'blood_inventory'
    AND record_id = v_inventory_id AND action = 'BLOOD_INVENTORY_UPDATED'
    AND new_value->>'available_units' = (v_available + 1)::text;

  SELECT * INTO v_after FROM public.save_blood_inventory(
    v_bank_id,v_group::text,v_available + 1,v_reserved,v_expired,v_minimum,now()::timestamp without time zone,v_inventory_id,v_updated_at
  );
  IF v_after.available_units <> v_available + 1
     OR v_after.reserved_units <> v_reserved OR v_after.expired_units <> v_expired THEN
    RAISE EXCEPTION 'Blood inventory edit did not preserve reserved and expired unit counts.';
  END IF;

  BEGIN
    PERFORM public.save_blood_inventory(v_bank_id,v_group::text,v_available,v_reserved,v_expired,v_minimum,NULL::timestamp without time zone,v_inventory_id,v_updated_at - interval '1 second');
  EXCEPTION WHEN SQLSTATE '40001' THEN v_stale_rejected := TRUE;
  END;
  IF NOT v_stale_rejected THEN RAISE EXCEPTION 'Blood inventory RPC accepted a stale version.'; END IF;

  SELECT * INTO v_created FROM public.save_blood_inventory(v_bank_id,v_test_group::text,9,1,1,3,now()::timestamp without time zone,NULL,NULL);
  IF v_created.blood_group <> v_test_group OR v_created.available_units <> 9 THEN
    RAISE EXCEPTION 'Blood inventory create did not return the expected synthetic row.';
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'blood_inventory'
    AND record_id = v_inventory_id AND action = 'BLOOD_INVENTORY_UPDATED'
    AND new_value->>'available_units' = (v_available + 1)::text;
  IF v_audit_count <> v_prior_audit_count + 1 THEN RAISE EXCEPTION 'Blood update did not produce one correctly keyed audit entry.'; END IF;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'blood_inventory'
    AND record_id = v_created.inventory_id AND action = 'BLOOD_INVENTORY_CREATED';
  IF v_audit_count <> 1 THEN RAISE EXCEPTION 'Blood create did not produce one correctly keyed audit entry.'; END IF;
  RAISE NOTICE 'PASS: invalid and stale writes rejected; create/edit audited; reserved and expired counts preserved.';
END;
$$;

ROLLBACK;
