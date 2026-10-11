-- Let a receiving hospital raise a resource need and discover nearby donors.
-- Source approval and the simulated handoff/receipt workflow remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.find_nearby_transfer_sources(p_resource_type TEXT)
RETURNS TABLE (
  source_hospital_id UUID,
  hospital_name TEXT,
  hospital_code TEXT,
  district TEXT,
  state TEXT,
  distance_km NUMERIC,
  resource_type TEXT,
  resource_name TEXT,
  resource_identity JSONB,
  transferable_quantity NUMERIC,
  unit TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_receiver public.hospitals;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.status IS DISTINCT FROM true OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active receiving-hospital administrator account is required';
  END IF;
  IF p_resource_type NOT IN ('ICU Beds','General Beds','Oxygen','Medicine') THEN
    RAISE EXCEPTION 'Unsupported transferable resource';
  END IF;
  SELECT * INTO v_receiver FROM public.hospitals WHERE hospital_id=v_user.hospital_id AND status='Active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Your assigned hospital must be active'; END IF;

  RETURN QUERY
  WITH donors AS (
    SELECT i.hospital_id, 'ICU Beds'::TEXT AS resource_type, 'ICU Beds'::TEXT AS resource_name,
      jsonb_build_object('resource_type','ICU Beds') AS identity,
      (i.available_icu_beds-i.minimum_icu_beds)::NUMERIC AS quantity, 'beds'::TEXT AS unit
    FROM public.icu_inventory i
    WHERE p_resource_type='ICU Beds' AND i.available_icu_beds>i.minimum_icu_beds
      AND (SELECT count(*) FROM public.icu_inventory x WHERE x.hospital_id=i.hospital_id)=1
    UNION ALL
    SELECT i.hospital_id, 'General Beds', 'General Beds', jsonb_build_object('resource_type','General Beds'),
      (i.available_beds-i.minimum_beds)::NUMERIC, 'beds'
    FROM public.general_bed_inventory i
    WHERE p_resource_type='General Beds' AND i.available_beds>i.minimum_beds
      AND (SELECT count(*) FROM public.general_bed_inventory x WHERE x.hospital_id=i.hospital_id)=1
    UNION ALL
    SELECT i.hospital_id, 'Oxygen', i.oxygen_type::TEXT,
      jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit),
      floor(i.available_capacity-i.minimum_threshold), i.unit
    FROM public.oxygen_inventory i
    WHERE p_resource_type='Oxygen' AND i.available_capacity>i.minimum_threshold
      AND (SELECT count(*) FROM public.oxygen_inventory x WHERE x.hospital_id=i.hospital_id
        AND x.oxygen_type=i.oxygen_type AND x.unit=i.unit)=1
    UNION ALL
    SELECT i.hospital_id, 'Medicine', i.medicine_name,
      jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,
        'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date),
      (i.current_stock-i.minimum_stock)::NUMERIC, i.unit
    FROM public.medicine_inventory i
    WHERE p_resource_type='Medicine' AND i.current_stock>i.minimum_stock
      AND (i.expiry_date IS NULL OR i.expiry_date>=CURRENT_DATE)
      AND (SELECT count(*) FROM public.medicine_inventory x WHERE x.hospital_id=i.hospital_id
        AND x.medicine_name=i.medicine_name AND x.category=i.category AND x.dosage=i.dosage
        AND x.manufacturer IS NOT DISTINCT FROM i.manufacturer AND x.unit=i.unit
        AND x.expiry_date IS NOT DISTINCT FROM i.expiry_date)=1
  ), located AS (
    SELECT h.hospital_id, h.hospital_name, h.hospital_code, h.district, h.state, h.latitude, h.longitude,
      d.resource_type, d.resource_name, d.identity, d.quantity, d.unit,
      CASE WHEN h.latitude IS NOT NULL AND h.longitude IS NOT NULL
             AND v_receiver.latitude IS NOT NULL AND v_receiver.longitude IS NOT NULL THEN
        round(
          (6371.0 * 2 * asin(sqrt(LEAST(1.0,GREATEST(0.0,
            power(sin(radians((h.latitude-v_receiver.latitude)::DOUBLE PRECISION/2)),2) +
            cos(radians(v_receiver.latitude::DOUBLE PRECISION)) * cos(radians(h.latitude::DOUBLE PRECISION)) *
            power(sin(radians((h.longitude-v_receiver.longitude)::DOUBLE PRECISION/2)),2)
          )))))::NUMERIC,
          1
        )
      ELSE NULL END AS distance
    FROM donors d JOIN public.hospitals h ON h.hospital_id=d.hospital_id
    WHERE h.status='Active' AND h.hospital_id<>v_user.hospital_id AND d.quantity>0
  )
  SELECT l.hospital_id,l.hospital_name,l.hospital_code,l.district,l.state,l.distance,
    l.resource_type,l.resource_name,l.identity,l.quantity,l.unit
  FROM located l
  ORDER BY l.distance NULLS LAST,l.state,l.district,l.hospital_name
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_inbound_resource_transfer(
  p_source_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_resource_identity JSONB,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user public.users; v_destination_id UUID; v_transfer public.resource_transfers;
  v_source_id UUID; v_target_id UUID; v_identity JSONB; v_source_count INTEGER; v_target_count INTEGER;
  v_available NUMERIC; v_minimum NUMERIC; v_recipients UUID[]; v_new_request BOOLEAN:=false;
  v_icu public.icu_inventory; v_beds public.general_bed_inventory;
  v_oxygen public.oxygen_inventory; v_medicine public.medicine_inventory;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.status IS DISTINCT FROM true OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active receiving-hospital administrator account is required';
  END IF;
  v_destination_id:=v_user.hospital_id;
  IF p_source_hospital_id IS NULL OR p_source_hospital_id=v_destination_id THEN RAISE EXCEPTION 'Choose a different source hospital'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Quantity and idempotency key are required'; END IF;
  IF p_resource_type NOT IN ('ICU Beds','General Beds','Oxygen','Medicine') THEN RAISE EXCEPTION 'Unsupported transferable resource'; END IF;

  PERFORM 1 FROM public.hospitals WHERE hospital_id IN (v_destination_id,p_source_hospital_id) AND status='Active' ORDER BY hospital_id FOR UPDATE;
  IF (SELECT count(*) FROM public.hospitals WHERE hospital_id IN (v_destination_id,p_source_hospital_id) AND status='Active')<>2 THEN
    RAISE EXCEPTION 'Source and receiving hospitals must both be active';
  END IF;

  IF p_resource_type='ICU Beds' THEN
    SELECT count(*) INTO v_source_count FROM public.icu_inventory WHERE hospital_id=p_source_hospital_id;
    IF v_source_count<>1 THEN RAISE EXCEPTION 'Source ICU inventory is missing or ambiguous'; END IF;
    SELECT * INTO v_icu FROM public.icu_inventory WHERE hospital_id=p_source_hospital_id FOR UPDATE;
    v_source_id:=v_icu.icu_inventory_id; v_available:=v_icu.available_icu_beds; v_minimum:=v_icu.minimum_icu_beds;
    v_identity:=jsonb_build_object('resource_type','ICU Beds');
    IF p_resource_name<>'ICU Beds' THEN RAISE EXCEPTION 'ICU resource name does not match'; END IF;
    SELECT count(*) INTO v_target_count FROM public.icu_inventory WHERE hospital_id=v_destination_id;
    IF v_target_count>1 THEN RAISE EXCEPTION 'Receiving ICU inventory is ambiguous';
    ELSIF v_target_count=1 THEN SELECT icu_inventory_id INTO v_target_id FROM public.icu_inventory WHERE hospital_id=v_destination_id;
    ELSE
      INSERT INTO public.icu_inventory(hospital_id,total_icu_beds,occupied_icu_beds,reserved_icu_beds,available_icu_beds,created_at,updated_at)
      VALUES(v_destination_id,0,0,0,0,now(),now()) RETURNING icu_inventory_id INTO v_target_id;
    END IF;
  ELSIF p_resource_type='General Beds' THEN
    SELECT count(*) INTO v_source_count FROM public.general_bed_inventory WHERE hospital_id=p_source_hospital_id;
    IF v_source_count<>1 THEN RAISE EXCEPTION 'Source general-bed inventory is missing or ambiguous'; END IF;
    SELECT * INTO v_beds FROM public.general_bed_inventory WHERE hospital_id=p_source_hospital_id FOR UPDATE;
    v_source_id:=v_beds.bed_inventory_id; v_available:=v_beds.available_beds; v_minimum:=v_beds.minimum_beds;
    v_identity:=jsonb_build_object('resource_type','General Beds');
    IF p_resource_name<>'General Beds' THEN RAISE EXCEPTION 'General-bed resource name does not match'; END IF;
    SELECT count(*) INTO v_target_count FROM public.general_bed_inventory WHERE hospital_id=v_destination_id;
    IF v_target_count>1 THEN RAISE EXCEPTION 'Receiving general-bed inventory is ambiguous';
    ELSIF v_target_count=1 THEN SELECT bed_inventory_id INTO v_target_id FROM public.general_bed_inventory WHERE hospital_id=v_destination_id;
    ELSE
      INSERT INTO public.general_bed_inventory(hospital_id,total_beds,occupied_beds,reserved_beds,available_beds,created_at,updated_at)
      VALUES(v_destination_id,0,0,0,0,now(),now()) RETURNING bed_inventory_id INTO v_target_id;
    END IF;
  ELSIF p_resource_type='Oxygen' THEN
    SELECT count(*) INTO v_source_count FROM public.oxygen_inventory i WHERE i.hospital_id=p_source_hospital_id
      AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit)=p_resource_identity;
    IF v_source_count<>1 THEN RAISE EXCEPTION 'Source oxygen identity is missing or ambiguous'; END IF;
    SELECT * INTO v_oxygen FROM public.oxygen_inventory i WHERE i.hospital_id=p_source_hospital_id
      AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit)=p_resource_identity FOR UPDATE;
    v_source_id:=v_oxygen.oxygen_inventory_id; v_available:=floor(v_oxygen.available_capacity); v_minimum:=v_oxygen.minimum_threshold;
    v_identity:=jsonb_build_object('resource_type','Oxygen','name',v_oxygen.oxygen_type::TEXT,'unit',v_oxygen.unit);
    IF p_resource_name IS DISTINCT FROM v_oxygen.oxygen_type::TEXT THEN RAISE EXCEPTION 'Oxygen resource name does not match'; END IF;
    SELECT count(*) INTO v_target_count FROM public.oxygen_inventory i WHERE i.hospital_id=v_destination_id
      AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit)=v_identity;
    IF v_target_count>1 THEN RAISE EXCEPTION 'Receiving oxygen identity is ambiguous';
    ELSIF v_target_count=1 THEN SELECT oxygen_inventory_id INTO v_target_id FROM public.oxygen_inventory i WHERE i.hospital_id=v_destination_id
      AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::TEXT,'unit',i.unit)=v_identity;
    ELSE
      INSERT INTO public.oxygen_inventory(hospital_id,oxygen_type,total_capacity,available_capacity,reserved_capacity,minimum_threshold,unit,created_at,updated_at)
      VALUES(v_destination_id,v_oxygen.oxygen_type,0,0,0,0,v_oxygen.unit,now(),now()) RETURNING oxygen_inventory_id INTO v_target_id;
    END IF;
  ELSE
    SELECT count(*) INTO v_source_count FROM public.medicine_inventory i WHERE i.hospital_id=p_source_hospital_id
      AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,'dosage',i.dosage,
        'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity;
    IF v_source_count<>1 THEN RAISE EXCEPTION 'Source medicine identity is missing or ambiguous'; END IF;
    SELECT * INTO v_medicine FROM public.medicine_inventory i WHERE i.hospital_id=p_source_hospital_id
      AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,'dosage',i.dosage,
        'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity FOR UPDATE;
    IF v_medicine.expiry_date IS NOT NULL AND v_medicine.expiry_date<CURRENT_DATE THEN RAISE EXCEPTION 'Expired medicine cannot be requested'; END IF;
    v_source_id:=v_medicine.medicine_inventory_id; v_available:=v_medicine.current_stock; v_minimum:=v_medicine.minimum_stock;
    v_identity:=jsonb_build_object('resource_type','Medicine','name',v_medicine.medicine_name,'category',v_medicine.category::TEXT,
      'dosage',v_medicine.dosage,'manufacturer',v_medicine.manufacturer,'unit',v_medicine.unit,'expiry_date',v_medicine.expiry_date);
    IF p_resource_name IS DISTINCT FROM v_medicine.medicine_name THEN RAISE EXCEPTION 'Medicine resource name does not match'; END IF;
    SELECT count(*) INTO v_target_count FROM public.medicine_inventory i WHERE i.hospital_id=v_destination_id
      AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,'dosage',i.dosage,
        'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=v_identity;
    IF v_target_count>1 THEN RAISE EXCEPTION 'Receiving medicine identity is ambiguous';
    ELSIF v_target_count=1 THEN SELECT medicine_inventory_id INTO v_target_id FROM public.medicine_inventory i WHERE i.hospital_id=v_destination_id
      AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::TEXT,'dosage',i.dosage,
        'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=v_identity;
    ELSE
      INSERT INTO public.medicine_inventory(hospital_id,medicine_name,category,dosage,manufacturer,current_stock,reserved_stock,minimum_stock,unit,expiry_date,created_at,updated_at)
      VALUES(v_destination_id,v_medicine.medicine_name,v_medicine.category,v_medicine.dosage,v_medicine.manufacturer,0,0,0,v_medicine.unit,v_medicine.expiry_date,now(),now())
      RETURNING medicine_inventory_id INTO v_target_id;
    END IF;
  END IF;

  IF v_identity IS DISTINCT FROM p_resource_identity THEN RAISE EXCEPTION 'Requested resource identity does not match the source inventory'; END IF;
  IF v_available IS NULL OR v_minimum IS NULL OR v_available-v_minimum<p_quantity THEN
    RAISE EXCEPTION 'Requested quantity exceeds source stock available above its protected minimum';
  END IF;
  INSERT INTO public.resource_transfers(source_hospital_id,destination_hospital_id,resource_type,resource_name,quantity,status,
    remarks,requested_by,source_inventory_id,destination_inventory_id,resource_identity,idempotency_key)
  VALUES(p_source_hospital_id,v_destination_id,p_resource_type::public.transfer_resource_type,p_resource_name,p_quantity,'Pending',
    NULL,v_user.user_id,v_source_id,v_target_id,v_identity,p_idempotency_key)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING * INTO v_transfer;
  IF v_transfer.source_hospital_id<>p_source_hospital_id OR v_transfer.destination_hospital_id<>v_destination_id
    OR v_transfer.resource_type<>p_resource_type::public.transfer_resource_type OR v_transfer.resource_name<>p_resource_name
    OR v_transfer.quantity<>p_quantity OR v_transfer.source_inventory_id IS DISTINCT FROM v_source_id
    OR v_transfer.destination_inventory_id IS DISTINCT FROM v_target_id OR v_transfer.resource_identity IS DISTINCT FROM v_identity THEN
    RAISE EXCEPTION 'Idempotency key has already been used for a different transfer request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id AND event_type='REQUESTED') THEN
    v_new_request:=true;
    INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,to_status,quantity,remarks)
    VALUES(v_transfer.transfer_id,v_user.user_id,'REQUESTED','Pending',p_quantity,NULL);
  END IF;
  IF v_new_request THEN
    SELECT array_agg(user_id) INTO v_recipients FROM public.users WHERE status IS TRUE AND
      ((role::text IN ('hospital_admin','hospital_approver') AND hospital_id=p_source_hospital_id) OR role::text='government_admin');
    PERFORM public.enqueue_workflow_notifications_internal(v_recipients,'resource_transfer_requested','resource_transfer',v_transfer.transfer_id,
      'Inbound synthetic resource request awaiting source approval',
      format('A nearby hospital requested %s %s. Review source availability before approval; the prototype does not arrange physical transport.',p_quantity,left(p_resource_name,120)),
      'Medium');
  END IF;
  RETURN v_transfer;
END;
$$;

-- Re-check bed protection thresholds under the source inventory row lock at
-- approval time; request-time availability is only a ranked snapshot.
DO $$
DECLARE v_definition TEXT; v_signature REGPROCEDURE;
BEGIN
  v_signature:='public.transition_resource_transfer_internal(uuid,text,integer,text)'::REGPROCEDURE;
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('SELECT available_icu_beds,0 INTO v_available,v_minimum' IN v_definition)=0
     OR position('SELECT available_beds,0 INTO v_available,v_minimum' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Unexpected bed availability checks in %',v_signature;
  END IF;
  v_definition:=replace(v_definition,'SELECT available_icu_beds,0 INTO v_available,v_minimum','SELECT available_icu_beds,minimum_icu_beds INTO v_available,v_minimum');
  v_definition:=replace(v_definition,'SELECT available_beds,0 INTO v_available,v_minimum','SELECT available_beds,minimum_beds INTO v_available,v_minimum');
  EXECUTE v_definition;
END;
$$;

REVOKE ALL ON FUNCTION public.find_nearby_transfer_sources(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.find_nearby_transfer_sources(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.request_inbound_resource_transfer(UUID,TEXT,TEXT,INTEGER,JSONB,UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_inbound_resource_transfer(UUID,TEXT,TEXT,INTEGER,JSONB,UUID) TO authenticated;
COMMIT;
