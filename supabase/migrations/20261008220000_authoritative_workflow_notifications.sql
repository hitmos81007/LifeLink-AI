-- Trusted workflow notifications are written in the same database transaction
-- as requests, clinician decisions, transfers, and stock threshold crossings.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_entity_reference_check') THEN
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_entity_reference_check CHECK (
      (entity_type IS NULL AND entity_id IS NULL) OR
      (entity_type IS NOT NULL AND entity_type IN ('patient_request','emergency_case','resource_transfer','blood_inventory','oxygen_inventory','medicine_inventory') AND entity_id IS NOT NULL)
    );
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
  ON public.notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Authenticated users can only read their own notifications and mark them read.
-- They cannot create or rewrite trusted event content.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='notifications' LOOP
    EXECUTE format('DROP POLICY %I ON public.notifications', p.policyname);
  END LOOP;
END;
$$;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read, updated_at) ON public.notifications TO authenticated;
CREATE POLICY notifications_receiver_read ON public.notifications
  FOR SELECT TO authenticated USING (receiver_id=auth.uid());
CREATE POLICY notifications_receiver_mark_read ON public.notifications
  FOR UPDATE TO authenticated USING (receiver_id=auth.uid()) WITH CHECK (receiver_id=auth.uid());

DO $$
DECLARE v_publication_all_tables boolean;
BEGIN
  SELECT puballtables INTO v_publication_all_tables FROM pg_publication WHERE pubname='supabase_realtime';
  IF FOUND AND NOT v_publication_all_tables AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_workflow_notifications_internal(
  p_recipients uuid[], p_event_type text, p_entity_type text, p_entity_id uuid,
  p_title text, p_message text, p_priority text DEFAULT 'Medium', p_instance_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_inserted integer;
BEGIN
  IF p_event_type IS NULL OR p_event_type !~ '^[a-z][a-z0-9_]{1,49}$' OR
     p_entity_type IS NULL OR p_entity_type NOT IN ('patient_request','emergency_case','resource_transfer','blood_inventory','oxygen_inventory','medicine_inventory') OR
     p_entity_id IS NULL OR p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 120 OR
     p_message IS NULL OR length(trim(p_message)) NOT BETWEEN 1 AND 600 OR
     p_priority IS NULL OR p_priority NOT IN ('Low','Medium','High','Critical') THEN
    RAISE EXCEPTION 'Invalid trusted workflow notification payload';
  END IF;

  INSERT INTO public.notifications(
    receiver_id,title,message,priority,is_read,created_at,updated_at,entity_type,entity_id,dedupe_key
  )
  SELECT DISTINCT u.user_id,p_title,p_message,p_priority::public.notification_priority,false,now(),now(),p_entity_type,p_entity_id,
    format('workflow:%s:%s:%s:%s:%s',p_event_type,p_entity_type,p_entity_id,COALESCE(p_instance_key,'once'),u.user_id)
  FROM unnest(COALESCE(p_recipients,'{}'::uuid[])) AS targets(user_id)
  JOIN public.users u ON u.user_id=targets.user_id AND u.status IS TRUE
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  RETURN v_inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_workflow_notifications_internal(uuid[],text,text,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;

-- A patient scenario only notifies the submitting account and active clinical
-- reviewers. Patient-provided urgency remains unverified and is not used as priority.
CREATE OR REPLACE FUNCTION public.create_synthetic_patient_request(
  p_emergency_type text,p_required_blood_group text,p_needs_blood boolean,p_needs_icu boolean,
  p_needs_general_bed boolean,p_needs_oxygen boolean,p_needs_ambulance boolean,p_reported_severity text
) RETURNS public.patient_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_request public.patient_requests; v_reviewers uuid[];
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'patient' OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active patient account is required to save a prototype scenario';
  END IF;
  IF p_emergency_type IS NULL OR p_emergency_type NOT IN ('Road Accident','Cardiac Arrest','Stroke','Trauma','Burn','Pregnancy','Poisoning','Other') THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario type';
  END IF;
  IF p_reported_severity IS NULL OR p_reported_severity NOT IN ('Low','Medium','High','Critical') THEN
    RAISE EXCEPTION 'Unsupported synthetic scenario severity';
  END IF;
  IF p_needs_blood IS NULL OR p_needs_icu IS NULL OR p_needs_general_bed IS NULL OR p_needs_oxygen IS NULL OR p_needs_ambulance IS NULL THEN
    RAISE EXCEPTION 'All synthetic scenario resource flags must be provided';
  END IF;
  IF p_needs_blood AND (p_required_blood_group IS NULL OR p_required_blood_group NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')) THEN
    RAISE EXCEPTION 'Select a valid blood group for this synthetic scenario';
  END IF;

  INSERT INTO public.patient_requests(
    patient_id,emergency_type,required_blood_group,needs_blood,needs_icu,needs_general_bed,
    needs_oxygen,needs_ambulance,reported_severity,severity,latitude,longitude,status,notes,
    data_origin,created_at,updated_at
  ) VALUES (
    v_user.user_id,p_emergency_type,CASE WHEN p_needs_blood THEN p_required_blood_group ELSE NULL END,
    p_needs_blood,p_needs_icu,p_needs_general_bed,p_needs_oxygen,p_needs_ambulance,
    p_reported_severity,p_reported_severity,NULL,NULL,'Pending',NULL,'synthetic',now(),now()
  ) RETURNING * INTO v_request;

  SELECT array_agg(user_id) INTO v_reviewers FROM public.users
    WHERE status IS TRUE AND role::text='clinician_reviewer';
  PERFORM public.enqueue_workflow_notifications_internal(
    ARRAY[v_user.user_id]::uuid[],'patient_request_saved','patient_request',v_request.request_id,
    'Synthetic scenario saved','Your fictional scenario was saved for prototype review. No emergency service was contacted.','Low'
  );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_reviewers,'patient_request_needs_review','patient_request',v_request.request_id,
    'Synthetic scenario awaiting review','A new fictional emergency scenario is waiting in the clinician review queue. Patient-reported urgency is unverified.','Medium'
  );
  RETURN v_request;
END;
$$;
REVOKE ALL ON FUNCTION public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_synthetic_patient_request(text,text,boolean,boolean,boolean,boolean,boolean,text) TO authenticated;

-- Resource transfer requests notify source-side approvers and government
-- oversight. Later state transitions notify both participating hospitals.
CREATE OR REPLACE FUNCTION public.request_resource_transfer(
  p_destination_hospital_id uuid,p_resource_type text,p_resource_name text,p_quantity integer,
  p_remarks text DEFAULT NULL,p_idempotency_key uuid DEFAULT gen_random_uuid(),p_resource_identity jsonb DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_transfer public.resource_transfers; v_recipients uuid[];
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.status IS DISTINCT FROM true OR v_user.hospital_id IS NULL THEN
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
  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      (role::text IN ('hospital_admin','hospital_approver') AND hospital_id=v_transfer.source_hospital_id)
      OR role::text='government_admin'
    );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'resource_transfer_requested','resource_transfer',v_transfer.transfer_id,
    'Synthetic transfer awaiting source approval',
    format('A prototype request proposes sending %s %s to another facility. Review the transfer before any simulated inventory change.',v_transfer.quantity,left(COALESCE(v_transfer.resource_name,v_transfer.resource_type),120)),
    'Medium'
  );
  RETURN v_transfer;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_resource_transfer(
  p_transfer_id uuid,p_new_status text,p_quantity integer DEFAULT NULL,p_remarks text DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_transfer public.resource_transfers; v_recipients uuid[]; v_priority text; v_safe_remarks text;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text NOT IN ('hospital_admin','hospital_approver') OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'An active hospital account is required';
  END IF;
  v_safe_remarks := CASE p_new_status
    WHEN 'Approved' THEN 'Approved by designated hospital approver'
    WHEN 'Rejected' THEN 'Rejected by source hospital approver'
    WHEN 'In Transit' THEN 'Simulated handoff recorded by source hospital'
    WHEN 'Completed' THEN 'Simulated receipt recorded by destination hospital'
    ELSE NULL
  END;
  SELECT * INTO v_transfer FROM public.transition_resource_transfer_internal(
    p_transfer_id,p_new_status,p_quantity,v_safe_remarks
  );
  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      role::text='government_admin' OR
      (role::text IN ('hospital_admin','hospital_approver') AND hospital_id IN (v_transfer.source_hospital_id,v_transfer.destination_hospital_id))
    );
  v_priority := CASE WHEN p_new_status IN ('Approved','In Transit','Completed') THEN 'High' ELSE 'Medium' END;
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'resource_transfer_'||lower(replace(p_new_status,' ','_')),'resource_transfer',v_transfer.transfer_id,
    'Synthetic transfer '||lower(p_new_status),
    format('Prototype transfer of %s %s is now %s. This records a simulated workflow step; no physical shipment is arranged.',COALESCE(v_transfer.approved_quantity,v_transfer.quantity),left(COALESCE(v_transfer.resource_name,v_transfer.resource_type),120),lower(p_new_status)),
    v_priority
  );
  RETURN v_transfer;
END;
$$;
REVOKE ALL ON FUNCTION public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transition_resource_transfer(uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_resource_transfer(uuid,text,integer,text) TO authenticated;

-- Use a trigger so the existing clinician wrapper's freshness and allocation
-- checks remain intact, while provider notices commit with the case decision.
CREATE OR REPLACE FUNCTION public.notify_confirmed_synthetic_case_providers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_recipients uuid[]; v_provider_id uuid;
BEGIN
  IF NEW.confirmation_status IS DISTINCT FROM 'confirmed' OR
     (TG_OP='UPDATE' AND OLD.confirmation_status IS NOT DISTINCT FROM 'confirmed') THEN
    RETURN NEW;
  END IF;
  SELECT provider_id INTO v_provider_id FROM public.ambulances WHERE ambulance_id=NEW.assigned_ambulance_id;
  SELECT array_agg(DISTINCT u.user_id) INTO v_recipients FROM public.users u
  WHERE u.status IS TRUE AND (
    (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id=NEW.assigned_hospital_id)
    OR (u.role::text='blood_bank_admin' AND u.blood_bank_id=NEW.assigned_blood_bank_id)
    OR (u.role::text='ambulance_admin' AND u.ambulance_provider_id=v_provider_id)
  );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'emergency_case_clinician_reviewed','emergency_case',NEW.case_id,
    'Synthetic case needs provider confirmation',
    'A clinician-reviewed synthetic scenario was matched to your facility or provider. Confirm availability directly; no resource is reserved or dispatched.',
    CASE WHEN NEW.clinician_confirmed_urgency='Critical' THEN 'High' ELSE 'Medium' END
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_confirmed_synthetic_case_providers() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_confirmed_synthetic_case_providers ON public.emergency_cases;
CREATE TRIGGER notify_confirmed_synthetic_case_providers
  AFTER INSERT OR UPDATE ON public.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_confirmed_synthetic_case_providers();

-- Low-stock alerts are generated by database state changes, not by a client
-- choosing recipients or inventing stock values.
CREATE OR REPLACE FUNCTION public.notify_oxygen_low_stock_crossing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_recipients uuid[];
BEGIN
  IF TG_OP<>'UPDATE' OR NOT (NEW.available_capacity<=NEW.minimum_threshold AND OLD.available_capacity>OLD.minimum_threshold) THEN
    RETURN NEW;
  END IF;
  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      (role::text IN ('hospital_admin','hospital_approver') AND hospital_id=NEW.hospital_id)
      OR role::text='government_admin'
    );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'oxygen_low_stock','oxygen_inventory',NEW.oxygen_inventory_id,
    'Synthetic oxygen inventory below threshold',
    format('Reported prototype oxygen availability is %s %s, at or below its configured minimum of %s.',NEW.available_capacity,left(NEW.unit,32),NEW.minimum_threshold),
    'Critical',txid_current()::text
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_oxygen_low_stock_crossing() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_oxygen_low_stock_crossing ON public.oxygen_inventory;
CREATE TRIGGER notify_oxygen_low_stock_crossing
  AFTER UPDATE OF available_capacity,minimum_threshold ON public.oxygen_inventory
  FOR EACH ROW EXECUTE FUNCTION public.notify_oxygen_low_stock_crossing();

CREATE OR REPLACE FUNCTION public.notify_medicine_low_stock_crossing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_recipients uuid[];
BEGIN
  IF TG_OP<>'UPDATE' OR NOT (NEW.current_stock<=NEW.minimum_stock AND OLD.current_stock>OLD.minimum_stock) THEN
    RETURN NEW;
  END IF;
  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      (role::text IN ('hospital_admin','hospital_approver') AND hospital_id=NEW.hospital_id)
      OR role::text='government_admin'
    );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'medicine_low_stock','medicine_inventory',NEW.medicine_inventory_id,
    'Synthetic medicine inventory below threshold',
    format('Reported prototype stock for %s is %s %s, at or below its configured minimum of %s.',left(NEW.medicine_name,120),NEW.current_stock,left(NEW.unit,32),NEW.minimum_stock),
    'Critical',txid_current()::text
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_medicine_low_stock_crossing() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_medicine_low_stock_crossing ON public.medicine_inventory;
CREATE TRIGGER notify_medicine_low_stock_crossing
  AFTER UPDATE OF current_stock,minimum_stock ON public.medicine_inventory
  FOR EACH ROW EXECUTE FUNCTION public.notify_medicine_low_stock_crossing();

CREATE OR REPLACE FUNCTION public.notify_low_blood_stock(p_blood_group text,p_usable_units integer,p_minimum_threshold integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_inventory public.blood_inventory; v_recipients uuid[]; v_inserted integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text<>'blood_bank_admin' OR v_user.blood_bank_id IS NULL THEN
    RAISE EXCEPTION 'An active blood bank administrator account is required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.blood_banks WHERE blood_bank_id=v_user.blood_bank_id AND status='Active') THEN
    RAISE EXCEPTION 'An active blood bank facility is required';
  END IF;
  IF p_blood_group NOT IN ('A+','A-','B+','B-','AB+','AB-','O+','O-') OR p_usable_units IS NULL OR p_usable_units<0 OR p_minimum_threshold IS NULL OR p_minimum_threshold<0 THEN
    RAISE EXCEPTION 'Invalid blood stock alert values';
  END IF;
  SELECT * INTO v_inventory FROM public.blood_inventory bi
    WHERE bi.blood_bank_id=v_user.blood_bank_id AND bi.blood_group::text=p_blood_group
      AND GREATEST(bi.available_units-bi.reserved_units-bi.expired_units,0)=p_usable_units
      AND bi.minimum_threshold=p_minimum_threshold;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blood stock alert must match saved inventory'; END IF;
  IF p_usable_units>p_minimum_threshold THEN RETURN 0; END IF;

  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      (role::text='blood_bank_admin' AND blood_bank_id=v_user.blood_bank_id)
      OR role::text='government_admin'
    );
  v_inserted := public.enqueue_workflow_notifications_internal(
    v_recipients,'blood_low_stock','blood_inventory',v_inventory.blood_inventory_id,
    'Synthetic blood inventory below threshold',
    format('Reported prototype stock for %s is %s usable units, at or below its configured minimum of %s.',p_blood_group,p_usable_units,p_minimum_threshold),
    'Critical',v_inventory.updated_at::text
  );
  RETURN v_inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_low_blood_stock(text,integer,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.notify_blood_low_stock_crossing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_recipients uuid[]; v_new_usable integer; v_old_usable integer;
BEGIN
  v_new_usable := GREATEST(NEW.available_units-NEW.reserved_units-NEW.expired_units,0);
  IF TG_OP='UPDATE' THEN
    v_old_usable := GREATEST(OLD.available_units-OLD.reserved_units-OLD.expired_units,0);
    IF NOT (v_new_usable<=NEW.minimum_threshold AND v_old_usable>OLD.minimum_threshold) THEN RETURN NEW; END IF;
  ELSE
    IF v_new_usable>NEW.minimum_threshold OR NEW.minimum_threshold=0 THEN RETURN NEW; END IF;
  END IF;

  SELECT array_agg(user_id) INTO v_recipients FROM public.users
    WHERE status IS TRUE AND (
      (role::text='blood_bank_admin' AND blood_bank_id=NEW.blood_bank_id)
      OR role::text='government_admin'
    );
  PERFORM public.enqueue_workflow_notifications_internal(
    v_recipients,'blood_low_stock','blood_inventory',NEW.inventory_id,
    'Synthetic blood inventory below threshold',
    format('Reported prototype stock for %s is %s usable units, at or below its configured minimum of %s.',NEW.blood_group,v_new_usable,NEW.minimum_threshold),
    'Critical',txid_current()::text
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_blood_low_stock_crossing() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_blood_low_stock_crossing ON public.blood_inventory;
CREATE TRIGGER notify_blood_low_stock_crossing
  AFTER INSERT OR UPDATE ON public.blood_inventory
  FOR EACH ROW EXECUTE FUNCTION public.notify_blood_low_stock_crossing();

COMMIT;
