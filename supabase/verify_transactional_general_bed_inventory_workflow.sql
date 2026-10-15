-- Rollback-only workflow check using an existing active hospital administrator
-- and that account's own synthetic hospital inventory.
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_hospital_id UUID;
  v_inventory_id UUID;
  v_total INTEGER;
  v_occupied INTEGER;
  v_reserved INTEGER;
  v_available INTEGER;
  v_minimum INTEGER;
  v_updated_at TIMESTAMPTZ;
  v_after public.general_bed_inventory;
  v_audit_count INTEGER;
  v_stale_rejected BOOLEAN := FALSE;
  v_invalid_rejected BOOLEAN := FALSE;
BEGIN
  SELECT u.user_id, u.hospital_id, i.bed_inventory_id, i.total_beds,
         i.occupied_beds, i.reserved_beds, i.available_beds, i.minimum_beds, i.updated_at
    INTO v_user_id, v_hospital_id, v_inventory_id, v_total,
         v_occupied, v_reserved, v_available, v_minimum, v_updated_at
  FROM public.users u
  JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
  JOIN public.general_bed_inventory i ON i.hospital_id = h.hospital_id
  WHERE u.role::text = 'hospital_admin' AND u.status IS TRUE AND u.account_status = 'active'
  ORDER BY u.created_at
  LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No active hospital admin with a general-bed inventory row is available.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM public.update_general_bed_inventory(
      v_hospital_id, v_total, -1, v_minimum, v_updated_at, 'routine_count'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Bed counts must be non-negative%' THEN v_invalid_rejected := TRUE; ELSE RAISE; END IF;
  END;
  IF NOT v_invalid_rejected THEN RAISE EXCEPTION 'General-bed RPC accepted negative occupied beds.'; END IF;

  SELECT * INTO v_after FROM public.update_general_bed_inventory(
    v_hospital_id, v_total + 1, v_occupied, v_minimum, v_updated_at, 'routine_count'
  );
  IF v_after.bed_inventory_id <> v_inventory_id
     OR v_after.total_beds <> v_total + 1
     OR v_after.occupied_beds <> v_occupied
     OR v_after.reserved_beds <> v_reserved
     OR v_after.available_beds <> v_available + 1 THEN
    RAISE EXCEPTION 'General-bed update did not preserve occupied/reserved beds while applying new counts.';
  END IF;

  BEGIN
    PERFORM public.update_general_bed_inventory(
      v_hospital_id, v_total + 1, v_occupied, v_minimum,
      v_updated_at - interval '1 second', 'routine_count'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_stale_rejected := TRUE;
  END;
  IF NOT v_stale_rejected THEN RAISE EXCEPTION 'General-bed RPC accepted a stale inventory version.'; END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
  WHERE user_id = v_user_id AND table_name = 'general_bed_inventory'
    AND record_id = v_inventory_id AND action = 'GENERAL_BED_INVENTORY_UPDATED'
    AND new_value->>'total_beds' = (v_total + 1)::text
    AND new_value->>'reason_code' = 'routine_count';
  IF v_audit_count <> 1 THEN RAISE EXCEPTION 'General-bed update did not create exactly one matching audit record.'; END IF;
  RAISE NOTICE 'PASS: invalid and stale writes rejected; valid update audited and preserved reserved beds.';
END;
$$;

ROLLBACK;
