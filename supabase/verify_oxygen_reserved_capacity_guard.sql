-- Rollback-only check: oxygen edits cannot shrink capacity below open-transfer holds.
BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_hospital_id UUID;
  v_inventory_id UUID;
  v_type TEXT;
  v_total NUMERIC;
  v_available NUMERIC;
  v_reserved NUMERIC;
  v_minimum NUMERIC;
  v_unit TEXT;
  v_updated_at TIMESTAMP WITHOUT TIME ZONE;
  v_after public.oxygen_inventory;
  v_rejected BOOLEAN := FALSE;
BEGIN
  SELECT u.user_id, u.hospital_id, i.oxygen_inventory_id, i.oxygen_type::text,
         i.total_capacity, i.available_capacity, i.reserved_capacity,
         i.minimum_threshold, i.unit, i.updated_at
    INTO v_user_id, v_hospital_id, v_inventory_id, v_type, v_total,
         v_available, v_reserved, v_minimum, v_unit, v_updated_at
  FROM public.users u
  JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
  JOIN public.oxygen_inventory i ON i.hospital_id = h.hospital_id
  WHERE u.role::text = 'hospital_admin' AND u.status IS TRUE AND u.account_status = 'active'
  ORDER BY u.created_at
  LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No active hospital admin with oxygen inventory is available.'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- Simulate a hold made by a transfer in this transaction, without changing its version.
  UPDATE public.oxygen_inventory
  SET reserved_capacity = v_total - v_available + 1
  WHERE oxygen_inventory_id = v_inventory_id
  RETURNING updated_at INTO v_updated_at;

  BEGIN
    PERFORM public.save_oxygen_inventory(
      v_hospital_id, v_type, v_total, v_available, v_minimum, v_unit,
      v_inventory_id, v_updated_at
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Available and transfer-reserved oxygen cannot exceed total capacity'
      THEN v_rejected := TRUE;
    ELSE RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Oxygen RPC accepted total capacity below available plus reserved.'; END IF;

  -- A valid edit must leave the existing reservation amount intact.
  UPDATE public.oxygen_inventory
  SET reserved_capacity = v_reserved
  WHERE oxygen_inventory_id = v_inventory_id
  RETURNING updated_at INTO v_updated_at;
  SELECT * INTO v_after FROM public.save_oxygen_inventory(
    v_hospital_id, v_type, v_total, v_available, v_minimum, v_unit,
    v_inventory_id, v_updated_at
  );
  IF v_after.reserved_capacity <> v_reserved THEN
    RAISE EXCEPTION 'Oxygen edit changed the transfer-reserved capacity.';
  END IF;
  RAISE NOTICE 'PASS: capacity below available plus reserved rejected; valid edit preserves reserved capacity.';
END;
$$;

ROLLBACK;
