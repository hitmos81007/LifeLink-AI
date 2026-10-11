-- Rollback-only create/update check using an active hospital administrator.
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_hospital_id UUID;
  v_inventory_id UUID;
  v_name TEXT;
  v_category TEXT;
  v_dosage TEXT;
  v_manufacturer TEXT;
  v_stock INTEGER;
  v_reserved INTEGER;
  v_minimum INTEGER;
  v_unit TEXT;
  v_expiry DATE;
  v_updated_at TIMESTAMPTZ;
  v_after public.medicine_inventory;
  v_created public.medicine_inventory;
  v_test_name TEXT := 'LifeLink rollback verifier ' || gen_random_uuid()::text;
  v_audit_count INTEGER;
  v_invalid_rejected BOOLEAN := FALSE;
  v_stale_rejected BOOLEAN := FALSE;
BEGIN
  SELECT u.user_id, u.hospital_id, m.medicine_inventory_id, m.medicine_name,
         m.category::text, m.dosage, m.manufacturer, m.current_stock, m.reserved_stock,
         m.minimum_stock, m.unit, m.expiry_date, m.updated_at
    INTO v_user_id, v_hospital_id, v_inventory_id, v_name, v_category, v_dosage,
         v_manufacturer, v_stock, v_reserved, v_minimum, v_unit, v_expiry, v_updated_at
  FROM public.users u
  JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
  JOIN public.medicine_inventory m ON m.hospital_id = h.hospital_id
  WHERE u.role::text = 'hospital_admin' AND u.status IS TRUE AND u.account_status = 'active'
  ORDER BY u.created_at, m.created_at
  LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No active hospital administrator with medicine inventory is available.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.save_medicine_inventory(v_hospital_id,v_name,v_category,v_dosage,v_manufacturer,-1,v_minimum,v_unit,v_expiry,v_inventory_id,v_updated_at);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Medicine details are invalid%' THEN v_invalid_rejected := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_invalid_rejected THEN RAISE EXCEPTION 'Medicine RPC accepted negative stock.'; END IF;

  UPDATE public.medicine_inventory SET reserved_stock = v_reserved + 1
  WHERE medicine_inventory_id = v_inventory_id RETURNING updated_at INTO v_updated_at;
  SELECT * INTO v_after FROM public.save_medicine_inventory(
    v_hospital_id,v_name,v_category,v_dosage,v_manufacturer,v_stock + 1,v_minimum,v_unit,v_expiry,v_inventory_id,v_updated_at
  );
  IF v_after.current_stock <> v_stock + 1 OR v_after.reserved_stock <> v_reserved + 1 THEN
    RAISE EXCEPTION 'Medicine edit changed transfer-held stock or failed to save available stock.';
  END IF;

  BEGIN
    PERFORM public.save_medicine_inventory(v_hospital_id,v_name,v_category,v_dosage,v_manufacturer,v_stock,v_minimum,v_unit,v_expiry,v_inventory_id,v_updated_at - interval '1 second');
  EXCEPTION WHEN SQLSTATE '40001' THEN v_stale_rejected := TRUE;
  END;
  IF NOT v_stale_rejected THEN RAISE EXCEPTION 'Medicine RPC accepted a stale inventory version.'; END IF;

  SELECT * INTO v_created FROM public.save_medicine_inventory(
    v_hospital_id,v_test_name,'Other','Synthetic demo',NULL,5,1,'packs',current_date + 30,NULL,NULL
  );
  IF v_created.medicine_name <> v_test_name OR v_created.current_stock <> 5 OR v_created.reserved_stock <> 0 THEN
    RAISE EXCEPTION 'Medicine create did not return the expected synthetic row.';
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'medicine_inventory'
    AND ((record_id = v_inventory_id AND action = 'MEDICINE_INVENTORY_UPDATED'
          AND new_value->>'current_stock' = (v_stock + 1)::text
          AND new_value->>'reserved_stock' = (v_reserved + 1)::text)
      OR (record_id = v_created.medicine_inventory_id AND action = 'MEDICINE_INVENTORY_CREATED'));
  IF v_audit_count <> 2 THEN RAISE EXCEPTION 'Medicine create/update did not produce exactly two matching audit entries.'; END IF;
  RAISE NOTICE 'PASS: invalid and stale writes rejected; add/edit audited; reserved stock preserved.';
END;
$$;

ROLLBACK;
