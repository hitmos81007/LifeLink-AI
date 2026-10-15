-- Rollback-only production smoke test for the synthetic hospital transfer lifecycle.
-- Run from the Supabase SQL Editor as database owner. It impersonates existing
-- synthetic demo users only within this transaction and persists no test rows.
BEGIN;
DO $$
DECLARE
  v_receiver_id UUID;
  v_receiver_hospital_id UUID;
  v_approver_id UUID;
  v_source_admin_id UUID;
  v_source_hospital_id UUID;
  v_transfer public.resource_transfers;
  v_transitioned public.resource_transfers;
  v_source_before RECORD;
  v_destination_before RECORD;
  v_source_after RECORD;
  v_destination_after RECORD;
  v_event_count INTEGER;
BEGIN
  SELECT h.hospital_id,
    (SELECT u.user_id FROM public.users u
      WHERE u.hospital_id=h.hospital_id AND u.role::TEXT='hospital_approver' AND u.status IS TRUE LIMIT 1),
    (SELECT u.user_id FROM public.users u
      WHERE u.hospital_id=h.hospital_id AND u.role::TEXT='hospital_admin' AND u.status IS TRUE LIMIT 1)
  INTO v_source_hospital_id,v_approver_id,v_source_admin_id
  FROM public.hospitals h
  JOIN public.general_bed_inventory i ON i.hospital_id=h.hospital_id
  WHERE h.status='Active' AND i.available_beds-i.minimum_beds>=1
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.hospital_id=h.hospital_id AND u.role::TEXT='hospital_approver' AND u.status IS TRUE)
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.hospital_id=h.hospital_id AND u.role::TEXT='hospital_admin' AND u.status IS TRUE)
  ORDER BY h.hospital_name LIMIT 1;
  IF v_source_hospital_id IS NULL OR v_approver_id IS NULL OR v_source_admin_id IS NULL THEN
    RAISE EXCEPTION 'No active synthetic donor with approver, admin, and general-bed surplus is available';
  END IF;

  SELECT h.hospital_id,u.user_id INTO v_receiver_hospital_id,v_receiver_id
  FROM public.hospitals h JOIN public.users u ON u.hospital_id=h.hospital_id
  WHERE h.status='Active' AND h.hospital_id<>v_source_hospital_id
    AND u.role::TEXT='hospital_admin' AND u.status IS TRUE
  ORDER BY h.hospital_name LIMIT 1;
  IF v_receiver_hospital_id IS NULL OR v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'No active receiving hospital administrator is available';
  END IF;

  SELECT available_beds,reserved_beds,total_beds,minimum_beds INTO v_source_before
  FROM public.general_bed_inventory WHERE hospital_id=v_source_hospital_id;
  SELECT count(*) AS row_count,COALESCE(max(total_beds),0) AS total_beds,
      COALESCE(max(available_beds),0) AS available_beds
  INTO v_destination_before FROM public.general_bed_inventory WHERE hospital_id=v_receiver_hospital_id;
  IF v_destination_before.row_count>1 THEN RAISE EXCEPTION 'Receiver bed inventory is ambiguous'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_receiver_id::TEXT,true);
  SELECT * INTO v_transfer FROM public.request_inbound_resource_transfer(
    v_source_hospital_id,'General Beds','General Beds',1,
    jsonb_build_object('resource_type','General Beds'),gen_random_uuid());
  IF v_transfer.status::TEXT<>'Pending' OR v_transfer.destination_hospital_id<>v_receiver_hospital_id THEN
    RAISE EXCEPTION 'Inbound request did not create the expected pending transfer';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_approver_id::TEXT,true);
  SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'Approved',1,NULL);
  IF v_transitioned.status::TEXT<>'Approved' OR v_transitioned.approved_quantity<>1 THEN
    RAISE EXCEPTION 'Source approval transition failed';
  END IF;
  SELECT available_beds,reserved_beds,total_beds INTO v_source_after
  FROM public.general_bed_inventory WHERE bed_inventory_id=v_transfer.source_inventory_id;
  IF v_source_after.available_beds<>v_source_before.available_beds-1
     OR v_source_after.reserved_beds<>v_source_before.reserved_beds+1 THEN
    RAISE EXCEPTION 'Approval did not reserve one unit at the source';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_source_admin_id::TEXT,true);
  SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'In Transit',NULL,NULL);
  IF v_transitioned.status::TEXT<>'In Transit' THEN RAISE EXCEPTION 'Simulated dispatch transition failed'; END IF;
  SELECT available_beds,reserved_beds,total_beds INTO v_source_after
  FROM public.general_bed_inventory WHERE bed_inventory_id=v_transfer.source_inventory_id;
  IF v_source_after.total_beds<>v_source_before.total_beds-1
     OR v_source_after.reserved_beds<>v_source_before.reserved_beds THEN
    RAISE EXCEPTION 'Dispatch did not consume the reserved source unit';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_receiver_id::TEXT,true);
  SELECT * INTO v_transitioned FROM public.transition_resource_transfer(v_transfer.transfer_id,'Completed',NULL,NULL);
  IF v_transitioned.status::TEXT<>'Completed' THEN RAISE EXCEPTION 'Simulated receipt transition failed'; END IF;
  SELECT total_beds,available_beds INTO v_destination_after
  FROM public.general_bed_inventory WHERE bed_inventory_id=v_transfer.destination_inventory_id;
  IF v_destination_after.total_beds<>v_destination_before.total_beds+1
     OR v_destination_after.available_beds<>v_destination_before.available_beds+1 THEN
    RAISE EXCEPTION 'Receipt did not add one available unit to the receiving hospital';
  END IF;
  SELECT count(*) INTO v_event_count FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id;
  IF v_event_count<>4 THEN
    RAISE EXCEPTION 'Expected request, approval, dispatch, and receipt events; found %',v_event_count;
  END IF;
  RAISE NOTICE 'PASS: request, approval, simulated dispatch, receipt, inventory deltas, and four timeline events verified; transaction will roll back.';
END;
$$;
ROLLBACK;
