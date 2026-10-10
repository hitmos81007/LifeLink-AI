-- Make resource transfers a server-authoritative, auditable workflow.
-- Blood is deliberately excluded: blood inventory belongs to blood banks, not hospitals.

ALTER TABLE public.resource_transfers
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS approved_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS source_inventory_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

ALTER TABLE public.resource_transfers
  ADD CONSTRAINT resource_transfers_approved_quantity_check
  CHECK (approved_quantity IS NULL OR (approved_quantity > 0 AND approved_quantity <= quantity));

CREATE UNIQUE INDEX IF NOT EXISTS resource_transfers_idempotency_key_uidx
  ON public.resource_transfers(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.oxygen_inventory
  ADD COLUMN IF NOT EXISTS reserved_capacity NUMERIC NOT NULL DEFAULT 0 CHECK (reserved_capacity >= 0);
ALTER TABLE public.medicine_inventory
  ADD COLUMN IF NOT EXISTS reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0);
ALTER TABLE public.icu_inventory ALTER COLUMN reserved_icu_beds SET DEFAULT 0;
UPDATE public.icu_inventory SET reserved_icu_beds=0 WHERE reserved_icu_beds IS NULL;
ALTER TABLE public.icu_inventory ALTER COLUMN reserved_icu_beds SET NOT NULL;

-- Reservations belong to the transfer workflow. Hospital users may edit operational
-- inventory fields, but cannot overwrite transfer-held stock through table updates.
REVOKE UPDATE ON public.icu_inventory, public.general_bed_inventory, public.oxygen_inventory, public.medicine_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON public.icu_inventory, public.general_bed_inventory, public.oxygen_inventory, public.medicine_inventory FROM PUBLIC, anon, authenticated;
GRANT UPDATE (total_icu_beds, occupied_icu_beds, available_icu_beds, updated_at) ON public.icu_inventory TO authenticated;
GRANT UPDATE (total_beds, occupied_beds, available_beds, updated_at) ON public.general_bed_inventory TO authenticated;
GRANT UPDATE (oxygen_type, total_capacity, available_capacity, minimum_threshold, unit, updated_at) ON public.oxygen_inventory TO authenticated;
GRANT UPDATE (medicine_name, category, dosage, manufacturer, current_stock, minimum_stock, unit, expiry_date, updated_at) ON public.medicine_inventory TO authenticated;
GRANT INSERT (hospital_id, total_icu_beds, occupied_icu_beds, available_icu_beds, created_at, updated_at) ON public.icu_inventory TO authenticated;
GRANT INSERT (hospital_id, total_beds, occupied_beds, available_beds, created_at, updated_at) ON public.general_bed_inventory TO authenticated;
GRANT INSERT (hospital_id, oxygen_type, total_capacity, available_capacity, minimum_threshold, unit, created_at, updated_at) ON public.oxygen_inventory TO authenticated;
GRANT INSERT (hospital_id, medicine_name, category, dosage, manufacturer, current_stock, minimum_stock, unit, expiry_date, created_at, updated_at) ON public.medicine_inventory TO authenticated;

CREATE TABLE IF NOT EXISTS public.resource_transfer_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.resource_transfers(transfer_id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES public.users(user_id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.resource_transfer_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='resource_transfers' LOOP
    EXECUTE format('DROP POLICY %I ON public.resource_transfers', p.policyname);
  END LOOP;
END $$;
CREATE POLICY resource_transfers_participant_read ON public.resource_transfers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND
      (u.role='government_admin' OR (u.role IN ('hospital_admin','hospital_approver') AND
       u.hospital_id IN (source_hospital_id,destination_hospital_id))))
  );
DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='resource_transfer_events' LOOP
    EXECUTE format('DROP POLICY %I ON public.resource_transfer_events', p.policyname);
  END LOOP;
END $$;
CREATE POLICY resource_transfer_events_participant_read ON public.resource_transfer_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.resource_transfers t JOIN public.users u ON u.user_id=auth.uid()
    WHERE t.transfer_id=resource_transfer_events.transfer_id AND
      (u.role='government_admin' OR (u.role IN ('hospital_admin','hospital_approver') AND
       u.hospital_id IN (t.source_hospital_id,t.destination_hospital_id)))
  ));
REVOKE INSERT, UPDATE, DELETE ON public.resource_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resource_transfers TO authenticated;
REVOKE ALL ON public.resource_transfer_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resource_transfer_events TO authenticated;

CREATE OR REPLACE FUNCTION public.request_resource_transfer(
  p_destination_hospital_id UUID, p_resource_type TEXT, p_resource_name TEXT,
  p_quantity INTEGER, p_remarks TEXT DEFAULT NULL, p_idempotency_key UUID DEFAULT gen_random_uuid()
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_transfer public.resource_transfers; v_destination_matches INTEGER;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Only a hospital administrator assigned to a hospital may request a transfer';
  END IF;
  IF p_destination_hospital_id IS NULL OR p_destination_hospital_id=v_user.hospital_id THEN RAISE EXCEPTION 'Choose a different destination hospital'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF p_resource_type NOT IN ('ICU Beds','General Beds','Oxygen','Medicine') THEN RAISE EXCEPTION 'Unsupported transferable resource'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospitals WHERE hospital_id=p_destination_hospital_id AND status='Active') THEN RAISE EXCEPTION 'Destination hospital is not active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospitals WHERE hospital_id=v_user.hospital_id AND status='Active') THEN RAISE EXCEPTION 'Source hospital is not active'; END IF;
  IF p_resource_type='ICU Beds' THEN
    SELECT count(*) INTO v_destination_matches FROM public.icu_inventory WHERE hospital_id=p_destination_hospital_id;
  ELSIF p_resource_type='General Beds' THEN
    SELECT count(*) INTO v_destination_matches FROM public.general_bed_inventory WHERE hospital_id=p_destination_hospital_id;
  ELSIF p_resource_type='Oxygen' THEN
    SELECT count(*) INTO v_destination_matches FROM public.oxygen_inventory WHERE hospital_id=p_destination_hospital_id AND oxygen_type=p_resource_name;
  ELSE
    SELECT count(*) INTO v_destination_matches FROM public.medicine_inventory WHERE hospital_id=p_destination_hospital_id AND medicine_name=p_resource_name;
  END IF;
  IF v_destination_matches<>1 THEN RAISE EXCEPTION 'Destination must have exactly one matching inventory record before requesting this transfer'; END IF;
  INSERT INTO public.resource_transfers(source_hospital_id,destination_hospital_id,resource_type,resource_name,quantity,status,remarks,requested_by,idempotency_key)
    VALUES(v_user.hospital_id,p_destination_hospital_id,p_resource_type,p_resource_name,p_quantity,'Pending',p_remarks,v_user.user_id,p_idempotency_key)
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
    RETURNING * INTO v_transfer;
  IF v_transfer.source_hospital_id<>v_user.hospital_id
     OR v_transfer.destination_hospital_id<>p_destination_hospital_id
     OR v_transfer.resource_type<>p_resource_type
     OR COALESCE(v_transfer.resource_name,'')<>COALESCE(p_resource_name,'')
     OR v_transfer.quantity<>p_quantity THEN
    RAISE EXCEPTION 'Idempotency key has already been used for a different transfer request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.resource_transfer_events WHERE transfer_id=v_transfer.transfer_id AND event_type='REQUESTED') THEN
    INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,to_status,quantity,remarks)
      VALUES(v_transfer.transfer_id,v_user.user_id,'REQUESTED','Pending',p_quantity,p_remarks);
  END IF;
  RETURN v_transfer;
END $$;

CREATE OR REPLACE FUNCTION public.transition_resource_transfer(
  p_transfer_id UUID, p_new_status TEXT, p_quantity INTEGER DEFAULT NULL, p_remarks TEXT DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_t public.resource_transfers; v_qty INTEGER;
  v_id UUID; v_num NUMERIC; v_rows INTEGER;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role NOT IN ('hospital_admin','hospital_approver') OR v_user.hospital_id IS NULL THEN RAISE EXCEPTION 'Hospital account required'; END IF;
  SELECT * INTO v_t FROM public.resource_transfers WHERE transfer_id=p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  v_qty:=COALESCE(p_quantity,v_t.quantity);
  IF v_qty<=0 OR v_qty>v_t.quantity THEN RAISE EXCEPTION 'Invalid approved quantity'; END IF;
  IF p_new_status='Rejected' THEN
    IF v_user.role<>'hospital_approver' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Pending' THEN RAISE EXCEPTION 'Only the source hospital approver may reject a pending request'; END IF;
    UPDATE public.resource_transfers SET status='Rejected',updated_at=now(),remarks=COALESCE(p_remarks,remarks) WHERE transfer_id=p_transfer_id;
  ELSIF p_new_status='Approved' THEN
    IF v_user.role<>'hospital_approver' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Pending' THEN RAISE EXCEPTION 'Only the source hospital approver may approve a pending request'; END IF;
    IF v_t.resource_type='ICU Beds' THEN
      SELECT icu_inventory_id,available_icu_beds INTO v_id,v_num FROM public.icu_inventory WHERE hospital_id=v_t.source_hospital_id FOR UPDATE;
      IF v_id IS NULL OR v_num<v_qty THEN RAISE EXCEPTION 'Insufficient available ICU beds'; END IF;
      UPDATE public.icu_inventory SET available_icu_beds=available_icu_beds-v_qty,reserved_icu_beds=reserved_icu_beds+v_qty,updated_at=now() WHERE icu_inventory_id=v_id;
    ELSIF v_t.resource_type='General Beds' THEN
      SELECT bed_inventory_id,available_beds INTO v_id,v_num FROM public.general_bed_inventory WHERE hospital_id=v_t.source_hospital_id FOR UPDATE;
      IF v_id IS NULL OR v_num<v_qty THEN RAISE EXCEPTION 'Insufficient available general beds'; END IF;
      UPDATE public.general_bed_inventory SET available_beds=available_beds-v_qty,reserved_beds=reserved_beds+v_qty,updated_at=now() WHERE bed_inventory_id=v_id;
    ELSIF v_t.resource_type='Oxygen' THEN
      SELECT oxygen_inventory_id,available_capacity INTO v_id,v_num FROM public.oxygen_inventory WHERE hospital_id=v_t.source_hospital_id AND oxygen_type=v_t.resource_name FOR UPDATE;
      IF v_id IS NULL OR v_num-v_qty<(SELECT minimum_threshold FROM public.oxygen_inventory WHERE oxygen_inventory_id=v_id) THEN RAISE EXCEPTION 'Insufficient oxygen above protected minimum'; END IF;
      UPDATE public.oxygen_inventory SET available_capacity=available_capacity-v_qty,reserved_capacity=reserved_capacity+v_qty,updated_at=now() WHERE oxygen_inventory_id=v_id;
    ELSIF v_t.resource_type='Medicine' THEN
      SELECT medicine_inventory_id,current_stock INTO v_id,v_num FROM public.medicine_inventory WHERE hospital_id=v_t.source_hospital_id AND medicine_name=v_t.resource_name FOR UPDATE;
      IF v_id IS NULL OR v_num-v_qty<(SELECT minimum_stock FROM public.medicine_inventory WHERE medicine_inventory_id=v_id) THEN RAISE EXCEPTION 'Insufficient medicine above protected minimum'; END IF;
      UPDATE public.medicine_inventory SET current_stock=current_stock-v_qty,reserved_stock=reserved_stock+v_qty,updated_at=now() WHERE medicine_inventory_id=v_id;
    END IF;
    UPDATE public.resource_transfers SET status='Approved',approved_by=v_user.user_id,approved_quantity=v_qty,source_inventory_id=v_id,updated_at=now(),remarks=COALESCE(p_remarks,remarks) WHERE transfer_id=p_transfer_id;
  ELSIF p_new_status='In Transit' THEN
    IF v_user.role<>'hospital_admin' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Approved' THEN RAISE EXCEPTION 'Only source hospital staff may dispatch an approved transfer'; END IF;
    v_qty:=v_t.approved_quantity;
    IF v_t.resource_type='ICU Beds' THEN UPDATE public.icu_inventory SET total_icu_beds=total_icu_beds-v_qty,reserved_icu_beds=reserved_icu_beds-v_qty,updated_at=now() WHERE icu_inventory_id=v_t.source_inventory_id AND reserved_icu_beds>=v_qty AND total_icu_beds>=v_qty;
    ELSIF v_t.resource_type='General Beds' THEN UPDATE public.general_bed_inventory SET total_beds=total_beds-v_qty,reserved_beds=reserved_beds-v_qty,updated_at=now() WHERE bed_inventory_id=v_t.source_inventory_id AND reserved_beds>=v_qty AND total_beds>=v_qty;
    ELSIF v_t.resource_type='Oxygen' THEN UPDATE public.oxygen_inventory SET total_capacity=total_capacity-v_qty,reserved_capacity=reserved_capacity-v_qty,updated_at=now() WHERE oxygen_inventory_id=v_t.source_inventory_id AND reserved_capacity>=v_qty AND total_capacity>=v_qty;
    ELSE UPDATE public.medicine_inventory SET reserved_stock=reserved_stock-v_qty,updated_at=now() WHERE medicine_inventory_id=v_t.source_inventory_id AND reserved_stock>=v_qty; END IF;
    GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'Reserved source stock is missing or ambiguous'; END IF;
    UPDATE public.resource_transfers SET status='In Transit',updated_at=now(),remarks=COALESCE(p_remarks,remarks) WHERE transfer_id=p_transfer_id;
  ELSIF p_new_status='Completed' THEN
    IF v_user.role<>'hospital_admin' OR v_user.hospital_id<>v_t.destination_hospital_id OR v_t.status<>'In Transit' THEN RAISE EXCEPTION 'Only destination hospital staff may confirm receipt of an in-transit transfer'; END IF;
    v_qty:=v_t.approved_quantity;
    IF v_t.resource_type='ICU Beds' THEN
      UPDATE public.icu_inventory SET total_icu_beds=total_icu_beds+v_qty,available_icu_beds=available_icu_beds+v_qty,updated_at=now() WHERE hospital_id=v_t.destination_hospital_id;
      GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'Destination ICU inventory must have exactly one initialized row'; END IF;
    ELSIF v_t.resource_type='General Beds' THEN
      UPDATE public.general_bed_inventory SET total_beds=total_beds+v_qty,available_beds=available_beds+v_qty,updated_at=now() WHERE hospital_id=v_t.destination_hospital_id;
      GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'Destination bed inventory must have exactly one initialized row'; END IF;
    ELSIF v_t.resource_type='Oxygen' THEN
      UPDATE public.oxygen_inventory SET total_capacity=total_capacity+v_qty,available_capacity=available_capacity+v_qty,updated_at=now() WHERE hospital_id=v_t.destination_hospital_id AND oxygen_type=v_t.resource_name;
      GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'Destination oxygen type must have exactly one initialized row'; END IF;
    ELSE
      UPDATE public.medicine_inventory SET current_stock=current_stock+v_qty,updated_at=now() WHERE hospital_id=v_t.destination_hospital_id AND medicine_name=v_t.resource_name;
      GET DIAGNOSTICS v_rows=ROW_COUNT; IF v_rows<>1 THEN RAISE EXCEPTION 'Destination medicine item must have exactly one initialized row'; END IF;
    END IF;
    UPDATE public.resource_transfers SET status='Completed',completed_at=now(),updated_at=now(),remarks=COALESCE(p_remarks,remarks) WHERE transfer_id=p_transfer_id;
  ELSE RAISE EXCEPTION 'Unsupported transfer transition';
  END IF;
  INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,from_status,to_status,quantity,remarks)
    VALUES(p_transfer_id,v_user.user_id,upper(replace(p_new_status,' ','_')),v_t.status,p_new_status,v_qty,p_remarks);
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
    VALUES(v_user.user_id,'RESOURCE_TRANSFER_'||upper(replace(p_new_status,' ','_')),'resource_transfers',p_transfer_id,
      jsonb_build_object('status',v_t.status),jsonb_build_object('status',p_new_status,'quantity',v_qty),now());
  SELECT * INTO v_t FROM public.resource_transfers WHERE transfer_id=p_transfer_id;
  RETURN v_t;
END $$;

DROP FUNCTION IF EXISTS public.complete_resource_transfer(UUID,UUID);
REVOKE ALL ON FUNCTION public.request_resource_transfer(UUID,TEXT,TEXT,INTEGER,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_resource_transfer(UUID,TEXT,INTEGER,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_resource_transfer(UUID,TEXT,TEXT,INTEGER,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_resource_transfer(UUID,TEXT,INTEGER,TEXT) TO authenticated;
