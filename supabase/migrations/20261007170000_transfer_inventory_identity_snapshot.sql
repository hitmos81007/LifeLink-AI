-- Bind each transfer to the exact inventory records and item identity that
-- were compatible when requested; recheck that identity when stock is held
-- and when the destination confirms receipt.
ALTER TABLE public.resource_transfers
  ADD COLUMN IF NOT EXISTS destination_inventory_id UUID,
  ADD COLUMN IF NOT EXISTS resource_identity JSONB;

CREATE OR REPLACE FUNCTION public.request_resource_transfer_internal(
  p_destination_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_remarks TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT gen_random_uuid()
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
  v_source_count INTEGER;
  v_destination_count INTEGER;
  v_source_id UUID;
  v_destination_id UUID;
  v_source_oxygen public.oxygen_inventory;
  v_destination_oxygen public.oxygen_inventory;
  v_source_medicine public.medicine_inventory;
  v_destination_medicine public.medicine_inventory;
  v_identity JSONB;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Only a hospital administrator assigned to a hospital may request a transfer';
  END IF;
  IF p_destination_hospital_id IS NULL OR p_destination_hospital_id=v_user.hospital_id THEN RAISE EXCEPTION 'Choose a different destination hospital'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_resource_type NOT IN ('ICU Beds','General Beds','Oxygen','Medicine') THEN RAISE EXCEPTION 'Unsupported transferable resource'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospitals WHERE hospital_id=p_destination_hospital_id AND status='Active') THEN RAISE EXCEPTION 'Destination hospital is not active'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hospitals WHERE hospital_id=v_user.hospital_id AND status='Active') THEN RAISE EXCEPTION 'Source hospital is not active'; END IF;

  IF p_resource_type='ICU Beds' THEN
    SELECT count(*) INTO v_source_count FROM public.icu_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT count(*) INTO v_destination_count FROM public.icu_inventory WHERE hospital_id=p_destination_hospital_id;
    SELECT icu_inventory_id INTO v_source_id FROM public.icu_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT icu_inventory_id INTO v_destination_id FROM public.icu_inventory WHERE hospital_id=p_destination_hospital_id;
    v_identity:=jsonb_build_object('resource_type','ICU Beds');
  ELSIF p_resource_type='General Beds' THEN
    SELECT count(*) INTO v_source_count FROM public.general_bed_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT count(*) INTO v_destination_count FROM public.general_bed_inventory WHERE hospital_id=p_destination_hospital_id;
    SELECT bed_inventory_id INTO v_source_id FROM public.general_bed_inventory WHERE hospital_id=v_user.hospital_id;
    SELECT bed_inventory_id INTO v_destination_id FROM public.general_bed_inventory WHERE hospital_id=p_destination_hospital_id;
    v_identity:=jsonb_build_object('resource_type','General Beds');
  ELSIF p_resource_type='Oxygen' THEN
    SELECT count(*) INTO v_source_count FROM public.oxygen_inventory WHERE hospital_id=v_user.hospital_id AND oxygen_type=p_resource_name;
    SELECT count(*) INTO v_destination_count FROM public.oxygen_inventory WHERE hospital_id=p_destination_hospital_id AND oxygen_type=p_resource_name;
    IF v_source_count=1 AND v_destination_count=1 THEN
      SELECT * INTO v_source_oxygen FROM public.oxygen_inventory WHERE hospital_id=v_user.hospital_id AND oxygen_type=p_resource_name;
      SELECT * INTO v_destination_oxygen FROM public.oxygen_inventory WHERE hospital_id=p_destination_hospital_id AND oxygen_type=p_resource_name;
      IF v_source_oxygen.unit IS DISTINCT FROM v_destination_oxygen.unit THEN RAISE EXCEPTION 'Source and destination oxygen units must match'; END IF;
      v_source_id:=v_source_oxygen.oxygen_inventory_id;
      v_destination_id:=v_destination_oxygen.oxygen_inventory_id;
      v_identity:=jsonb_build_object('resource_type','Oxygen','name',v_source_oxygen.oxygen_type::text,'unit',v_source_oxygen.unit);
    END IF;
  ELSE
    SELECT count(*) INTO v_source_count FROM public.medicine_inventory WHERE hospital_id=v_user.hospital_id AND medicine_name=p_resource_name;
    SELECT count(*) INTO v_destination_count FROM public.medicine_inventory WHERE hospital_id=p_destination_hospital_id AND medicine_name=p_resource_name;
    IF v_source_count=1 AND v_destination_count=1 THEN
      SELECT * INTO v_source_medicine FROM public.medicine_inventory WHERE hospital_id=v_user.hospital_id AND medicine_name=p_resource_name;
      SELECT * INTO v_destination_medicine FROM public.medicine_inventory WHERE hospital_id=p_destination_hospital_id AND medicine_name=p_resource_name;
      IF v_source_medicine.category IS DISTINCT FROM v_destination_medicine.category
         OR v_source_medicine.dosage IS DISTINCT FROM v_destination_medicine.dosage
         OR v_source_medicine.manufacturer IS DISTINCT FROM v_destination_medicine.manufacturer
         OR v_source_medicine.unit IS DISTINCT FROM v_destination_medicine.unit
         OR v_source_medicine.expiry_date IS DISTINCT FROM v_destination_medicine.expiry_date THEN
        RAISE EXCEPTION 'Source and destination medicine formulation, unit, and expiry record must match';
      END IF;
      v_source_id:=v_source_medicine.medicine_inventory_id;
      v_destination_id:=v_destination_medicine.medicine_inventory_id;
      v_identity:=jsonb_build_object('resource_type','Medicine','name',v_source_medicine.medicine_name,
        'category',v_source_medicine.category::text,'dosage',v_source_medicine.dosage,
        'manufacturer',v_source_medicine.manufacturer,'unit',v_source_medicine.unit,
        'expiry_date',v_source_medicine.expiry_date);
    END IF;
  END IF;
  IF v_source_count<>1 OR v_destination_count<>1 THEN RAISE EXCEPTION 'Source and destination must each have exactly one matching inventory record'; END IF;

  INSERT INTO public.resource_transfers(
    source_hospital_id,destination_hospital_id,resource_type,resource_name,quantity,status,
    remarks,requested_by,source_inventory_id,destination_inventory_id,resource_identity,idempotency_key
  ) VALUES (
    v_user.hospital_id,p_destination_hospital_id,p_resource_type::public.transfer_resource_type,p_resource_name,p_quantity,'Pending',
    p_remarks,v_user.user_id,v_source_id,v_destination_id,v_identity,p_idempotency_key
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING * INTO v_transfer;

  IF v_transfer.source_hospital_id<>v_user.hospital_id
     OR v_transfer.destination_hospital_id<>p_destination_hospital_id
     OR v_transfer.resource_type<>p_resource_type::public.transfer_resource_type
     OR COALESCE(v_transfer.resource_name,'')<>COALESCE(p_resource_name,'')
     OR v_transfer.quantity<>p_quantity
     OR v_transfer.source_inventory_id IS DISTINCT FROM v_source_id
     OR v_transfer.destination_inventory_id IS DISTINCT FROM v_destination_id
     OR v_transfer.resource_identity IS DISTINCT FROM v_identity THEN
    RAISE EXCEPTION 'Idempotency key has already been used for a different transfer request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id AND event_type='REQUESTED') THEN
    INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,to_status,quantity,remarks)
      VALUES(v_transfer.transfer_id,v_user.user_id,'REQUESTED','Pending',p_quantity,p_remarks);
  END IF;
  RETURN v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_resource_transfer_inventory_identity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF (NEW.status='Approved' AND OLD.status='Pending')
     OR (NEW.status='In Transit' AND OLD.status='Approved') THEN
    IF NEW.resource_identity IS NULL OR NEW.source_inventory_id IS DISTINCT FROM OLD.source_inventory_id THEN
      RAISE EXCEPTION 'Source inventory changed after the transfer request was created';
    END IF;
    IF NEW.resource_type='ICU Beds' THEN
      IF NOT EXISTS(SELECT 1 FROM public.icu_inventory i WHERE i.icu_inventory_id=NEW.source_inventory_id AND i.hospital_id=NEW.source_hospital_id) THEN RAISE EXCEPTION 'Requested source ICU inventory is no longer available'; END IF;
    ELSIF NEW.resource_type='General Beds' THEN
      IF NOT EXISTS(SELECT 1 FROM public.general_bed_inventory i WHERE i.bed_inventory_id=NEW.source_inventory_id AND i.hospital_id=NEW.source_hospital_id) THEN RAISE EXCEPTION 'Requested source general-bed inventory is no longer available'; END IF;
    ELSIF NEW.resource_type='Oxygen' THEN
      IF NOT EXISTS(SELECT 1 FROM public.oxygen_inventory i WHERE i.oxygen_inventory_id=NEW.source_inventory_id AND i.hospital_id=NEW.source_hospital_id AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=NEW.resource_identity) THEN RAISE EXCEPTION 'Requested source oxygen inventory identity changed'; END IF;
    ELSIF NEW.resource_type='Medicine' THEN
      IF NOT EXISTS(SELECT 1 FROM public.medicine_inventory i WHERE i.medicine_inventory_id=NEW.source_inventory_id AND i.hospital_id=NEW.source_hospital_id AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=NEW.resource_identity) THEN RAISE EXCEPTION 'Requested source medicine identity changed'; END IF;
    END IF;
  ELSIF NEW.status='Completed' AND OLD.status='In Transit' THEN
    IF NEW.resource_identity IS NULL OR NEW.destination_inventory_id IS DISTINCT FROM OLD.destination_inventory_id THEN
      RAISE EXCEPTION 'Destination inventory changed after the transfer request was created';
    END IF;
    IF NEW.resource_type='ICU Beds' THEN
      IF NOT EXISTS(SELECT 1 FROM public.icu_inventory i WHERE i.icu_inventory_id=NEW.destination_inventory_id AND i.hospital_id=NEW.destination_hospital_id) THEN RAISE EXCEPTION 'Requested destination ICU inventory is no longer available'; END IF;
    ELSIF NEW.resource_type='General Beds' THEN
      IF NOT EXISTS(SELECT 1 FROM public.general_bed_inventory i WHERE i.bed_inventory_id=NEW.destination_inventory_id AND i.hospital_id=NEW.destination_hospital_id) THEN RAISE EXCEPTION 'Requested destination general-bed inventory is no longer available'; END IF;
    ELSIF NEW.resource_type='Oxygen' THEN
      IF NOT EXISTS(SELECT 1 FROM public.oxygen_inventory i WHERE i.oxygen_inventory_id=NEW.destination_inventory_id AND i.hospital_id=NEW.destination_hospital_id AND jsonb_build_object('resource_type','Oxygen','name',i.oxygen_type::text,'unit',i.unit)=NEW.resource_identity) THEN RAISE EXCEPTION 'Requested destination oxygen inventory identity changed'; END IF;
    ELSIF NEW.resource_type='Medicine' THEN
      IF NOT EXISTS(SELECT 1 FROM public.medicine_inventory i WHERE i.medicine_inventory_id=NEW.destination_inventory_id AND i.hospital_id=NEW.destination_hospital_id AND jsonb_build_object('resource_type','Medicine','name',i.medicine_name,'category',i.category::text,'dosage',i.dosage,'manufacturer',i.manufacturer,'unit',i.unit,'expiry_date',i.expiry_date)=NEW.resource_identity) THEN RAISE EXCEPTION 'Requested destination medicine identity changed'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resource_transfer_identity_guard ON public.resource_transfers;
CREATE TRIGGER resource_transfer_identity_guard
  BEFORE UPDATE OF status ON public.resource_transfers
  FOR EACH ROW EXECUTE FUNCTION public.validate_resource_transfer_inventory_identity();

REVOKE ALL ON FUNCTION public.validate_resource_transfer_inventory_identity() FROM PUBLIC, anon, authenticated;
