-- Require compatible source/destination inventory identity before a transfer
-- request is recorded. Labels alone are insufficient for medicine/oxygen stock.
CREATE OR REPLACE FUNCTION public.request_resource_transfer_internal(
  p_destination_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_remarks TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
) RETURNS public.resource_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
  v_source_matches INTEGER;
  v_destination_matches INTEGER;
  v_source_oxygen public.oxygen_inventory;
  v_destination_oxygen public.oxygen_inventory;
  v_source_medicine public.medicine_inventory;
  v_destination_medicine public.medicine_inventory;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.role::text <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Only a hospital administrator assigned to a hospital may request a transfer';
  END IF;
  IF p_destination_hospital_id IS NULL OR p_destination_hospital_id = v_user.hospital_id THEN
    RAISE EXCEPTION 'Choose a different destination hospital';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_resource_type NOT IN ('ICU Beds', 'General Beds', 'Oxygen', 'Medicine') THEN
    RAISE EXCEPTION 'Unsupported transferable resource';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospitals WHERE hospital_id=p_destination_hospital_id AND status='Active') THEN
    RAISE EXCEPTION 'Destination hospital is not active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospitals WHERE hospital_id=v_user.hospital_id AND status='Active') THEN
    RAISE EXCEPTION 'Source hospital is not active';
  END IF;

  IF p_resource_type='ICU Beds' THEN
    SELECT count(*) INTO v_source_matches FROM public.icu_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT count(*) INTO v_destination_matches FROM public.icu_inventory WHERE hospital_id=p_destination_hospital_id;
  ELSIF p_resource_type='General Beds' THEN
    SELECT count(*) INTO v_source_matches FROM public.general_bed_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT count(*) INTO v_destination_matches FROM public.general_bed_inventory WHERE hospital_id=p_destination_hospital_id;
  ELSIF p_resource_type='Oxygen' THEN
    SELECT count(*) INTO v_source_matches FROM public.oxygen_inventory WHERE hospital_id=v_user.hospital_id AND oxygen_type=p_resource_name;
    SELECT count(*) INTO v_destination_matches FROM public.oxygen_inventory WHERE hospital_id=p_destination_hospital_id AND oxygen_type=p_resource_name;
    IF v_source_matches=1 AND v_destination_matches=1 THEN
      SELECT * INTO v_source_oxygen FROM public.oxygen_inventory WHERE hospital_id=v_user.hospital_id AND oxygen_type=p_resource_name;
      SELECT * INTO v_destination_oxygen FROM public.oxygen_inventory WHERE hospital_id=p_destination_hospital_id AND oxygen_type=p_resource_name;
      IF v_source_oxygen.unit IS DISTINCT FROM v_destination_oxygen.unit THEN
        RAISE EXCEPTION 'Source and destination oxygen units must match';
      END IF;
    END IF;
  ELSE
    SELECT count(*) INTO v_source_matches FROM public.medicine_inventory WHERE hospital_id=v_user.hospital_id AND medicine_name=p_resource_name;
    SELECT count(*) INTO v_destination_matches FROM public.medicine_inventory WHERE hospital_id=p_destination_hospital_id AND medicine_name=p_resource_name;
    IF v_source_matches=1 AND v_destination_matches=1 THEN
      SELECT * INTO v_source_medicine FROM public.medicine_inventory WHERE hospital_id=v_user.hospital_id AND medicine_name=p_resource_name;
      SELECT * INTO v_destination_medicine FROM public.medicine_inventory WHERE hospital_id=p_destination_hospital_id AND medicine_name=p_resource_name;
      IF v_source_medicine.category IS DISTINCT FROM v_destination_medicine.category
         OR v_source_medicine.dosage IS DISTINCT FROM v_destination_medicine.dosage
         OR v_source_medicine.manufacturer IS DISTINCT FROM v_destination_medicine.manufacturer
         OR v_source_medicine.unit IS DISTINCT FROM v_destination_medicine.unit
         OR v_source_medicine.expiry_date IS DISTINCT FROM v_destination_medicine.expiry_date THEN
        RAISE EXCEPTION 'Source and destination medicine formulation, unit, and expiry record must match';
      END IF;
    END IF;
  END IF;
  IF v_source_matches<>1 OR v_destination_matches<>1 THEN
    RAISE EXCEPTION 'Source and destination must each have exactly one matching inventory record';
  END IF;

  INSERT INTO public.resource_transfers(
    source_hospital_id,destination_hospital_id,resource_type,resource_name,
    quantity,status,remarks,requested_by,idempotency_key
  ) VALUES (
    v_user.hospital_id,p_destination_hospital_id,p_resource_type,p_resource_name,
    p_quantity,'Pending',p_remarks,v_user.user_id,p_idempotency_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO v_transfer;

  IF v_transfer.source_hospital_id<>v_user.hospital_id
     OR v_transfer.destination_hospital_id<>p_destination_hospital_id
     OR v_transfer.resource_type<>p_resource_type
     OR COALESCE(v_transfer.resource_name,'')<>COALESCE(p_resource_name,'')
     OR v_transfer.quantity<>p_quantity THEN
    RAISE EXCEPTION 'Idempotency key has already been used for a different transfer request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id AND event_type='REQUESTED') THEN
    INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,to_status,quantity,remarks)
      VALUES(v_transfer.transfer_id,v_user.user_id,'REQUESTED','Pending',p_quantity,p_remarks);
  END IF;
  RETURN v_transfer;
END;
$$;
