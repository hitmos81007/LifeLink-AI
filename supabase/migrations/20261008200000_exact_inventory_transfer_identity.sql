-- Allow a transfer request to identify compatible oxygen or medicine stock by
-- its complete inventory identity. Existing six-argument callers remain
-- supported and retain the prior unambiguous-name behavior.
BEGIN;

CREATE FUNCTION public.request_resource_transfer_with_identity_internal(
  p_destination_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_resource_identity JSONB,
  p_idempotency_key UUID
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user public.users;
  v_source_count INTEGER;
  v_destination_count INTEGER;
  v_source_id UUID;
  v_destination_id UUID;
  v_transfer public.resource_transfers;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Only a hospital administrator assigned to a hospital may request a transfer';
  END IF;
  IF p_resource_type NOT IN ('Oxygen','Medicine') THEN
    RAISE EXCEPTION 'Exact item identity is only supported for oxygen and medicine';
  END IF;
  IF p_destination_hospital_id IS NULL OR p_destination_hospital_id=v_user.hospital_id THEN
    RAISE EXCEPTION 'Choose a different destination hospital';
  END IF;
  IF p_quantity IS NULL OR p_quantity<=0 OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Quantity and idempotency key are required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospitals WHERE hospital_id=p_destination_hospital_id AND status='Active')
     OR NOT EXISTS(SELECT 1 FROM public.hospitals WHERE hospital_id=v_user.hospital_id AND status='Active') THEN
    RAISE EXCEPTION 'Source and destination hospitals must be active';
  END IF;

  IF p_resource_type='Oxygen' THEN
    IF p_resource_identity IS NULL OR p_resource_identity->>'resource_type'<>'Oxygen'
       OR p_resource_identity->>'name' IS DISTINCT FROM p_resource_name THEN
      RAISE EXCEPTION 'A matching oxygen inventory identity is required';
    END IF;
    SELECT count(*) INTO v_source_count FROM public.oxygen_inventory i
      WHERE i.hospital_id=v_user.hospital_id
        AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=p_resource_identity;
    SELECT count(*) INTO v_destination_count FROM public.oxygen_inventory i
      WHERE i.hospital_id=p_destination_hospital_id
        AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=p_resource_identity;
    IF v_source_count=1 AND v_destination_count=1 THEN
      SELECT i.oxygen_inventory_id INTO v_source_id FROM public.oxygen_inventory i
        WHERE i.hospital_id=v_user.hospital_id
          AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=p_resource_identity;
      SELECT i.oxygen_inventory_id INTO v_destination_id FROM public.oxygen_inventory i
        WHERE i.hospital_id=p_destination_hospital_id
          AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=p_resource_identity;
    END IF;
  ELSE
    IF p_resource_identity IS NULL OR p_resource_identity->>'resource_type'<>'Medicine'
       OR p_resource_identity->>'name' IS DISTINCT FROM p_resource_name THEN
      RAISE EXCEPTION 'A matching medicine inventory identity is required';
    END IF;
    SELECT count(*) INTO v_source_count FROM public.medicine_inventory i
      WHERE i.hospital_id=v_user.hospital_id
        AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,
          'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity;
    SELECT count(*) INTO v_destination_count FROM public.medicine_inventory i
      WHERE i.hospital_id=p_destination_hospital_id
        AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,
          'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity;
    IF v_source_count=1 AND v_destination_count=1 THEN
      SELECT i.medicine_inventory_id INTO v_source_id FROM public.medicine_inventory i
        WHERE i.hospital_id=v_user.hospital_id
          AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,
            'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity;
      SELECT i.medicine_inventory_id INTO v_destination_id FROM public.medicine_inventory i
        WHERE i.hospital_id=p_destination_hospital_id
          AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,
            'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=p_resource_identity;
    END IF;
  END IF;
  IF v_source_count<>1 OR v_destination_count<>1 THEN
    RAISE EXCEPTION 'Source and destination must each have exactly one matching inventory identity';
  END IF;

  INSERT INTO public.resource_transfers(
    source_hospital_id,destination_hospital_id,resource_type,resource_name,quantity,status,
    remarks,requested_by,source_inventory_id,destination_inventory_id,resource_identity,idempotency_key
  ) VALUES (
    v_user.hospital_id,p_destination_hospital_id,p_resource_type,p_resource_name,p_quantity,'Pending',
    NULL,v_user.user_id,v_source_id,v_destination_id,p_resource_identity,p_idempotency_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO v_transfer;

  IF v_transfer.source_hospital_id<>v_user.hospital_id
     OR v_transfer.destination_hospital_id<>p_destination_hospital_id
     OR v_transfer.resource_type<>p_resource_type
     OR v_transfer.resource_name<>p_resource_name
     OR v_transfer.quantity<>p_quantity
     OR v_transfer.source_inventory_id IS DISTINCT FROM v_source_id
     OR v_transfer.destination_inventory_id IS DISTINCT FROM v_destination_id
     OR v_transfer.resource_identity IS DISTINCT FROM p_resource_identity THEN
    RAISE EXCEPTION 'Idempotency key has already been used for a different transfer request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id AND event_type='REQUESTED') THEN
    INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,to_status,quantity,remarks)
      VALUES(v_transfer.transfer_id,v_user.user_id,'REQUESTED','Pending',p_quantity,NULL);
  END IF;
  RETURN v_transfer;
END;
$$;

DROP FUNCTION public.request_resource_transfer(UUID,TEXT,TEXT,INTEGER,TEXT,UUID);

CREATE FUNCTION public.request_resource_transfer(
  p_destination_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_remarks TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT gen_random_uuid(),
  p_resource_identity JSONB DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active hospital administrator account is required';
  END IF;
  IF p_resource_identity IS NULL THEN
    SELECT * INTO v_transfer FROM public.request_resource_transfer_internal(
      p_destination_hospital_id,p_resource_type,p_resource_name,p_quantity,NULL,p_idempotency_key
    );
  ELSE
    SELECT * INTO v_transfer FROM public.request_resource_transfer_with_identity_internal(
      p_destination_hospital_id,p_resource_type,p_resource_name,p_quantity,p_resource_identity,p_idempotency_key
    );
  END IF;
  RETURN v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.request_resource_transfer_with_identity_internal(UUID,TEXT,TEXT,INTEGER,JSONB,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_resource_transfer(UUID,TEXT,TEXT,INTEGER,TEXT,UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_resource_transfer(UUID,TEXT,TEXT,INTEGER,TEXT,UUID,JSONB) TO authenticated;

COMMIT;
