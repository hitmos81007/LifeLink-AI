-- Rollback-only lifecycle check for location-discovered transfer resources.
-- Uses existing active hospital accounts and inventory; all rows, notifications,
-- audit entries, and inventory changes are rolled back at the end.
BEGIN;

DO $$
DECLARE
  v_resource_type TEXT;
  v_receiver RECORD;
  v_source RECORD;
  v_receiver_id UUID;
  v_receiver_user_id UUID;
  v_source_hospital_id UUID;
  v_source_approver_id UUID;
  v_source_admin_id UUID;
  v_transfer public.resource_transfers;
  v_transitioned public.resource_transfers;
  v_event_count INTEGER;
  v_source_stock_before NUMERIC;
  v_source_total_before NUMERIC;
  v_source_reserved_before NUMERIC;
  v_source_stock_after NUMERIC;
  v_source_total_after NUMERIC;
  v_source_reserved_after NUMERIC;
  v_destination_rows_before INTEGER;
  v_destination_stock_before NUMERIC;
  v_destination_total_before NUMERIC;
  v_destination_stock_after NUMERIC;
  v_destination_total_after NUMERIC;
BEGIN
  FOREACH v_resource_type IN ARRAY ARRAY['ICU Beds', 'General Beds', 'Oxygen', 'Medicine'] LOOP
    v_receiver_id := NULL;
    v_source_hospital_id := NULL;
    v_source_approver_id := NULL;
    v_source_admin_id := NULL;

    FOR v_receiver IN
      SELECT h.hospital_id, u.user_id
      FROM public.hospitals h
      JOIN public.users u ON u.hospital_id = h.hospital_id
      WHERE h.status = 'Active'
        AND h.latitude IS NOT NULL
        AND h.longitude IS NOT NULL
        AND u.role::TEXT = 'hospital_admin'
        AND u.status IS TRUE
      ORDER BY h.hospital_name, u.user_id
    LOOP
      PERFORM set_config('request.jwt.claim.sub', v_receiver.user_id::TEXT, true);

      SELECT candidate.* INTO v_source
      FROM public.find_nearby_transfer_sources(v_resource_type, 250) candidate
      WHERE candidate.transferable_quantity >= 1
        AND EXISTS (
          SELECT 1 FROM public.users approver
          WHERE approver.hospital_id = candidate.source_hospital_id
            AND approver.role::TEXT = 'hospital_approver'
            AND approver.status IS TRUE
        )
        AND EXISTS (
          SELECT 1 FROM public.users source_admin
          WHERE source_admin.hospital_id = candidate.source_hospital_id
            AND source_admin.role::TEXT = 'hospital_admin'
            AND source_admin.status IS TRUE
        )
      ORDER BY candidate.distance_km, candidate.hospital_name
      LIMIT 1;

      IF FOUND THEN
        v_receiver_id := v_receiver.hospital_id;
        v_receiver_user_id := v_receiver.user_id;
        v_source_hospital_id := v_source.source_hospital_id;

        SELECT user_id INTO v_source_approver_id
        FROM public.users
        WHERE hospital_id = v_source_hospital_id
          AND role::TEXT = 'hospital_approver'
          AND status IS TRUE
        ORDER BY user_id
        LIMIT 1;

        SELECT user_id INTO v_source_admin_id
        FROM public.users
        WHERE hospital_id = v_source_hospital_id
          AND role::TEXT = 'hospital_admin'
          AND status IS TRUE
        ORDER BY user_id
        LIMIT 1;
        EXIT;
      END IF;
    END LOOP;

    IF v_receiver_id IS NULL OR v_source_hospital_id IS NULL
       OR v_source_approver_id IS NULL OR v_source_admin_id IS NULL THEN
      RAISE EXCEPTION 'No located % donor with source approver/admin and receiving admin accounts is available', v_resource_type;
    END IF;

    IF v_resource_type = 'ICU Beds' THEN
      SELECT available_icu_beds, total_icu_beds, reserved_icu_beds
      INTO v_source_stock_before, v_source_total_before, v_source_reserved_before
      FROM public.icu_inventory WHERE hospital_id = v_source_hospital_id;
    ELSIF v_resource_type = 'General Beds' THEN
      SELECT available_beds, total_beds, reserved_beds
      INTO v_source_stock_before, v_source_total_before, v_source_reserved_before
      FROM public.general_bed_inventory WHERE hospital_id = v_source_hospital_id;
    ELSIF v_resource_type = 'Oxygen' THEN
      SELECT available_capacity, total_capacity, reserved_capacity
      INTO v_source_stock_before, v_source_total_before, v_source_reserved_before
      FROM public.oxygen_inventory
      WHERE hospital_id = v_source_hospital_id
        AND jsonb_build_object('resource_type','Oxygen','name',oxygen_type::TEXT,'unit',unit)=v_source.resource_identity;
    ELSE
      SELECT current_stock, current_stock, reserved_stock
      INTO v_source_stock_before, v_source_total_before, v_source_reserved_before
      FROM public.medicine_inventory
      WHERE hospital_id = v_source_hospital_id
        AND jsonb_build_object('resource_type','Medicine','name',medicine_name,'category',category::TEXT,
          'dosage',dosage,'manufacturer',manufacturer,'unit',unit,'expiry_date',expiry_date)=v_source.resource_identity;
    END IF;

    IF v_resource_type = 'ICU Beds' THEN
      SELECT count(*), COALESCE(max(available_icu_beds),0), COALESCE(max(total_icu_beds),0)
      INTO v_destination_rows_before, v_destination_stock_before, v_destination_total_before
      FROM public.icu_inventory WHERE hospital_id = v_receiver_id;
    ELSIF v_resource_type = 'General Beds' THEN
      SELECT count(*), COALESCE(max(available_beds),0), COALESCE(max(total_beds),0)
      INTO v_destination_rows_before, v_destination_stock_before, v_destination_total_before
      FROM public.general_bed_inventory WHERE hospital_id = v_receiver_id;
    ELSIF v_resource_type = 'Oxygen' THEN
      SELECT count(*), COALESCE(max(available_capacity),0), COALESCE(max(total_capacity),0)
      INTO v_destination_rows_before, v_destination_stock_before, v_destination_total_before
      FROM public.oxygen_inventory
      WHERE hospital_id = v_receiver_id
        AND jsonb_build_object('resource_type','Oxygen','name',oxygen_type::TEXT,'unit',unit)=v_source.resource_identity;
    ELSE
      SELECT count(*), COALESCE(max(current_stock),0), COALESCE(max(current_stock),0)
      INTO v_destination_rows_before, v_destination_stock_before, v_destination_total_before
      FROM public.medicine_inventory
      WHERE hospital_id = v_receiver_id
        AND jsonb_build_object('resource_type','Medicine','name',medicine_name,'category',category::TEXT,
          'dosage',dosage,'manufacturer',manufacturer,'unit',unit,'expiry_date',expiry_date)=v_source.resource_identity;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_receiver_user_id::TEXT, true);
    SELECT * INTO v_transfer
    FROM public.request_inbound_resource_transfer(
      v_source_hospital_id, v_resource_type, v_source.resource_name, 1,
      v_source.resource_identity, gen_random_uuid()
    );
    IF v_transfer.status::TEXT <> 'Pending'
       OR v_transfer.destination_hospital_id <> v_receiver_id
       OR v_transfer.source_hospital_id <> v_source_hospital_id THEN
      RAISE EXCEPTION 'Location-based % request did not create the expected pending transfer', v_resource_type;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_source_approver_id::TEXT, true);
    SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'Approved',1,NULL);
    IF v_transitioned.status::TEXT <> 'Approved' OR v_transitioned.approved_quantity <> 1 THEN
      RAISE EXCEPTION '% source approval failed', v_resource_type;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_source_admin_id::TEXT, true);
    SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'In Transit',NULL,NULL);
    IF v_transitioned.status::TEXT <> 'In Transit' THEN
      RAISE EXCEPTION '% simulated handoff failed', v_resource_type;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_receiver_user_id::TEXT, true);
    SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'Completed',NULL,NULL);
    IF v_transitioned.status::TEXT <> 'Completed' THEN
      RAISE EXCEPTION '% simulated receipt failed', v_resource_type;
    END IF;

    IF v_resource_type = 'ICU Beds' THEN
      SELECT available_icu_beds, total_icu_beds, reserved_icu_beds
      INTO v_source_stock_after, v_source_total_after, v_source_reserved_after
      FROM public.icu_inventory WHERE icu_inventory_id = v_transfer.source_inventory_id;
      SELECT available_icu_beds, total_icu_beds
      INTO v_destination_stock_after, v_destination_total_after
      FROM public.icu_inventory WHERE icu_inventory_id = v_transfer.destination_inventory_id;
    ELSIF v_resource_type = 'General Beds' THEN
      SELECT available_beds, total_beds, reserved_beds
      INTO v_source_stock_after, v_source_total_after, v_source_reserved_after
      FROM public.general_bed_inventory WHERE bed_inventory_id = v_transfer.source_inventory_id;
      SELECT available_beds, total_beds
      INTO v_destination_stock_after, v_destination_total_after
      FROM public.general_bed_inventory WHERE bed_inventory_id = v_transfer.destination_inventory_id;
    ELSIF v_resource_type = 'Oxygen' THEN
      SELECT available_capacity, total_capacity, reserved_capacity
      INTO v_source_stock_after, v_source_total_after, v_source_reserved_after
      FROM public.oxygen_inventory WHERE oxygen_inventory_id = v_transfer.source_inventory_id;
      SELECT available_capacity, total_capacity
      INTO v_destination_stock_after, v_destination_total_after
      FROM public.oxygen_inventory WHERE oxygen_inventory_id = v_transfer.destination_inventory_id;
    ELSE
      SELECT current_stock, current_stock, reserved_stock
      INTO v_source_stock_after, v_source_total_after, v_source_reserved_after
      FROM public.medicine_inventory WHERE medicine_inventory_id = v_transfer.source_inventory_id;
      SELECT current_stock, current_stock
      INTO v_destination_stock_after, v_destination_total_after
      FROM public.medicine_inventory WHERE medicine_inventory_id = v_transfer.destination_inventory_id;
    END IF;

    IF v_source_stock_after <> v_source_stock_before - 1
       OR v_source_reserved_after <> v_source_reserved_before
       OR (v_resource_type <> 'Medicine' AND v_source_total_after <> v_source_total_before - 1)
       OR v_destination_stock_after <> v_destination_stock_before + 1
       OR v_destination_total_after <> v_destination_total_before + 1 THEN
      RAISE EXCEPTION '% lifecycle did not produce the expected one-unit source/receiver inventory deltas', v_resource_type;
    END IF;

    SELECT count(*) INTO v_event_count
    FROM public.resource_transfer_events WHERE transfer_id = v_transfer.transfer_id;
    IF v_event_count <> 4 THEN
      RAISE EXCEPTION 'Expected four % timeline events; found %', v_resource_type, v_event_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS: all four located resource types completed request, approval, simulated handoff, receipt, inventory-delta, and timeline checks. Transaction will roll back.';
END;
$$;

ROLLBACK;
