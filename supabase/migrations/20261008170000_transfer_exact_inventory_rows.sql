-- Keep every transition bound to the inventory rows captured when requested.
-- The public RPC and active-account wrapper remain unchanged.
CREATE OR REPLACE FUNCTION public.transition_resource_transfer_internal(
  p_transfer_id UUID,
  p_new_status TEXT,
  p_quantity INTEGER DEFAULT NULL,
  p_remarks TEXT DEFAULT NULL
) RETURNS public.resource_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_t public.resource_transfers;
  v_qty INTEGER;
  v_source_id UUID;
  v_destination_id UUID;
  v_available NUMERIC;
  v_minimum NUMERIC;
  v_rows INTEGER;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text NOT IN ('hospital_admin','hospital_approver')
     OR v_user.hospital_id IS NULL OR v_user.status IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Active hospital account required';
  END IF;

  SELECT * INTO v_t FROM public.resource_transfers WHERE transfer_id=p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  v_qty:=COALESCE(p_quantity,v_t.quantity);
  IF v_qty<=0 OR v_qty>v_t.quantity THEN RAISE EXCEPTION 'Invalid approved quantity'; END IF;

  IF p_new_status='Rejected' THEN
    IF v_user.role::text<>'hospital_approver' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Pending' THEN
      RAISE EXCEPTION 'Only the source hospital approver may reject a pending request';
    END IF;
    UPDATE public.resource_transfers SET status='Rejected',updated_at=now(),remarks=COALESCE(p_remarks,remarks)
      WHERE transfer_id=p_transfer_id;

  ELSIF p_new_status='Approved' THEN
    IF v_user.role::text<>'hospital_approver' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Pending' THEN
      RAISE EXCEPTION 'Only the source hospital approver may approve a pending request';
    END IF;
    v_source_id:=v_t.source_inventory_id;
    IF v_source_id IS NULL OR v_t.resource_identity IS NULL THEN RAISE EXCEPTION 'Transfer inventory snapshot is missing'; END IF;

    IF v_t.resource_type='ICU Beds' THEN
      SELECT available_icu_beds,0 INTO v_available,v_minimum FROM public.icu_inventory
        WHERE icu_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id FOR UPDATE;
    ELSIF v_t.resource_type='General Beds' THEN
      SELECT available_beds,0 INTO v_available,v_minimum FROM public.general_bed_inventory
        WHERE bed_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id FOR UPDATE;
    ELSIF v_t.resource_type='Oxygen' THEN
      SELECT available_capacity,minimum_threshold INTO v_available,v_minimum FROM public.oxygen_inventory
        WHERE oxygen_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id
          AND jsonb_build_object('resource_type','Oxygen','name',oxygen_type::text,'unit',unit)=v_t.resource_identity FOR UPDATE;
    ELSIF v_t.resource_type='Medicine' THEN
      SELECT current_stock,minimum_stock INTO v_available,v_minimum FROM public.medicine_inventory
        WHERE medicine_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id
          AND jsonb_build_object('resource_type','Medicine','name',medicine_name,'category',category::text,
            'dosage',dosage,'manufacturer',manufacturer,'unit',unit,'expiry_date',expiry_date)=v_t.resource_identity
          AND (expiry_date IS NULL OR expiry_date>=current_date) FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'Unsupported transferable resource';
    END IF;
    IF v_available IS NULL OR v_available-v_qty<v_minimum THEN RAISE EXCEPTION 'Insufficient source stock above protected minimum'; END IF;

    IF v_t.resource_type='ICU Beds' THEN
      UPDATE public.icu_inventory SET available_icu_beds=available_icu_beds-v_qty,reserved_icu_beds=reserved_icu_beds+v_qty,updated_at=now()
        WHERE icu_inventory_id=v_source_id;
    ELSIF v_t.resource_type='General Beds' THEN
      UPDATE public.general_bed_inventory SET available_beds=available_beds-v_qty,reserved_beds=reserved_beds+v_qty,updated_at=now()
        WHERE bed_inventory_id=v_source_id;
    ELSIF v_t.resource_type='Oxygen' THEN
      UPDATE public.oxygen_inventory SET available_capacity=available_capacity-v_qty,reserved_capacity=reserved_capacity+v_qty,updated_at=now()
        WHERE oxygen_inventory_id=v_source_id;
    ELSE
      UPDATE public.medicine_inventory SET current_stock=current_stock-v_qty,reserved_stock=reserved_stock+v_qty,updated_at=now()
        WHERE medicine_inventory_id=v_source_id;
    END IF;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION 'Snapshotted source inventory row could not be reserved'; END IF;
    UPDATE public.resource_transfers SET status='Approved',approved_by=v_user.user_id,approved_quantity=v_qty,
      updated_at=now(),remarks=COALESCE(p_remarks,remarks) WHERE transfer_id=p_transfer_id;

  ELSIF p_new_status='In Transit' THEN
    IF v_user.role::text<>'hospital_admin' OR v_user.hospital_id<>v_t.source_hospital_id OR v_t.status<>'Approved' THEN
      RAISE EXCEPTION 'Only source hospital staff may dispatch an approved transfer';
    END IF;
    v_qty:=v_t.approved_quantity;
    v_source_id:=v_t.source_inventory_id;
    IF v_source_id IS NULL THEN RAISE EXCEPTION 'Snapshotted source inventory row is missing'; END IF;
    IF v_t.resource_type='ICU Beds' THEN
      UPDATE public.icu_inventory SET total_icu_beds=total_icu_beds-v_qty,reserved_icu_beds=reserved_icu_beds-v_qty,updated_at=now()
        WHERE icu_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id AND reserved_icu_beds>=v_qty AND total_icu_beds>=v_qty;
    ELSIF v_t.resource_type='General Beds' THEN
      UPDATE public.general_bed_inventory SET total_beds=total_beds-v_qty,reserved_beds=reserved_beds-v_qty,updated_at=now()
        WHERE bed_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id AND reserved_beds>=v_qty AND total_beds>=v_qty;
    ELSIF v_t.resource_type='Oxygen' THEN
      UPDATE public.oxygen_inventory SET total_capacity=total_capacity-v_qty,reserved_capacity=reserved_capacity-v_qty,updated_at=now()
        WHERE oxygen_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id AND reserved_capacity>=v_qty AND total_capacity>=v_qty
          AND jsonb_build_object('resource_type','Oxygen','name',oxygen_type::text,'unit',unit)=v_t.resource_identity;
    ELSIF v_t.resource_type='Medicine' THEN
      UPDATE public.medicine_inventory SET reserved_stock=reserved_stock-v_qty,updated_at=now()
        WHERE medicine_inventory_id=v_source_id AND hospital_id=v_t.source_hospital_id AND reserved_stock>=v_qty
          AND jsonb_build_object('resource_type','Medicine','name',medicine_name,'category',category::text,
            'dosage',dosage,'manufacturer',manufacturer,'unit',unit,'expiry_date',expiry_date)=v_t.resource_identity;
    ELSE
      RAISE EXCEPTION 'Unsupported transferable resource';
    END IF;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION 'Snapshotted source inventory reservation is missing or inconsistent'; END IF;
    UPDATE public.resource_transfers SET status='In Transit',updated_at=now(),remarks=COALESCE(p_remarks,remarks)
      WHERE transfer_id=p_transfer_id;

  ELSIF p_new_status='Completed' THEN
    IF v_user.role::text<>'hospital_admin' OR v_user.hospital_id<>v_t.destination_hospital_id OR v_t.status<>'In Transit' THEN
      RAISE EXCEPTION 'Only destination hospital staff may confirm receipt of an in-transit transfer';
    END IF;
    v_qty:=v_t.approved_quantity;
    v_destination_id:=v_t.destination_inventory_id;
    IF v_destination_id IS NULL OR v_t.resource_identity IS NULL THEN RAISE EXCEPTION 'Transfer destination snapshot is missing'; END IF;
    IF v_t.resource_type='ICU Beds' THEN
      UPDATE public.icu_inventory SET total_icu_beds=total_icu_beds+v_qty,available_icu_beds=available_icu_beds+v_qty,updated_at=now()
        WHERE icu_inventory_id=v_destination_id AND hospital_id=v_t.destination_hospital_id;
    ELSIF v_t.resource_type='General Beds' THEN
      UPDATE public.general_bed_inventory SET total_beds=total_beds+v_qty,available_beds=available_beds+v_qty,updated_at=now()
        WHERE bed_inventory_id=v_destination_id AND hospital_id=v_t.destination_hospital_id;
    ELSIF v_t.resource_type='Oxygen' THEN
      UPDATE public.oxygen_inventory SET total_capacity=total_capacity+v_qty,available_capacity=available_capacity+v_qty,updated_at=now()
        WHERE oxygen_inventory_id=v_destination_id AND hospital_id=v_t.destination_hospital_id
          AND jsonb_build_object('resource_type','Oxygen','name',oxygen_type::text,'unit',unit)=v_t.resource_identity;
    ELSIF v_t.resource_type='Medicine' THEN
      UPDATE public.medicine_inventory SET current_stock=current_stock+v_qty,updated_at=now()
        WHERE medicine_inventory_id=v_destination_id AND hospital_id=v_t.destination_hospital_id
          AND jsonb_build_object('resource_type','Medicine','name',medicine_name,'category',category::text,
            'dosage',dosage,'manufacturer',manufacturer,'unit',unit,'expiry_date',expiry_date)=v_t.resource_identity
          AND (expiry_date IS NULL OR expiry_date>=current_date);
    ELSE
      RAISE EXCEPTION 'Unsupported transferable resource';
    END IF;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION 'Snapshotted destination inventory row is missing or inconsistent'; END IF;
    UPDATE public.resource_transfers SET status='Completed',completed_at=now(),updated_at=now(),remarks=COALESCE(p_remarks,remarks)
      WHERE transfer_id=p_transfer_id;
  ELSE
    RAISE EXCEPTION 'Unsupported transfer transition';
  END IF;

  INSERT INTO public.resource_transfer_events(transfer_id,actor_id,event_type,from_status,to_status,quantity,remarks)
    VALUES(p_transfer_id,v_user.user_id,upper(replace(p_new_status,' ','_')),v_t.status,p_new_status,v_qty,p_remarks);
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
    VALUES(v_user.user_id,'RESOURCE_TRANSFER_'||upper(replace(p_new_status,' ','_')),'resource_transfers',p_transfer_id,
      jsonb_build_object('status',v_t.status),jsonb_build_object('status',p_new_status,'quantity',v_qty),now());
  SELECT * INTO v_t FROM public.resource_transfers WHERE transfer_id=p_transfer_id;
  RETURN v_t;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_resource_transfer_internal(UUID,TEXT,INTEGER,TEXT) FROM PUBLIC,anon,authenticated;
