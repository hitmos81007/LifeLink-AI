-- Run after 20261007170000_transfer_inventory_identity_snapshot.sql.
-- Read-only checks: validates the request RPC stores identity snapshots and
-- the status trigger rechecks source/destination identities transactionally.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.request_resource_transfer_internal(uuid,text,text,integer,text,uuid)');
  v_guard regprocedure := to_regprocedure('public.validate_resource_transfer_inventory_identity()');
  v_request_definition text;
  v_guard_definition text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='resource_transfers' AND column_name='destination_inventory_id' AND data_type='uuid')
     OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='resource_transfers' AND column_name='resource_identity' AND data_type='jsonb') THEN
    RAISE EXCEPTION 'Transfer inventory identity snapshot columns are missing';
  END IF;
  IF v_rpc IS NULL OR v_guard IS NULL THEN RAISE EXCEPTION 'Transfer request function or identity guard trigger function is missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.resource_transfers'::regclass AND tgname='resource_transfer_identity_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Transfer identity guard trigger is not installed';
  END IF;
  v_request_definition:=pg_get_functiondef(v_rpc);
  IF position('source_inventory_id,destination_inventory_id,resource_identity' IN v_request_definition)=0 OR
     position('v_source_medicine.expiry_date IS DISTINCT FROM v_destination_medicine.expiry_date' IN v_request_definition)=0 OR
     position('v_source_oxygen.unit IS DISTINCT FROM v_destination_oxygen.unit' IN v_request_definition)=0 THEN
    RAISE EXCEPTION 'Transfer requests do not persist exact compatible inventory identity';
  END IF;
  v_guard_definition:=pg_get_functiondef(v_guard);
  IF position('NEW.status=''Approved'' AND OLD.status=''Pending''' IN v_guard_definition)=0 OR
     position('NEW.status=''Completed'' AND OLD.status=''In Transit''' IN v_guard_definition)=0 OR
     position('NEW.source_inventory_id' IN v_guard_definition)=0 OR
     position('NEW.destination_inventory_id' IN v_guard_definition)=0 OR
     position('NEW.resource_identity' IN v_guard_definition)=0 THEN
    RAISE EXCEPTION 'Transfer approvals and receipts do not revalidate request-time item identity';
  END IF;
  RAISE NOTICE 'Transfer inventory identity snapshot checks passed.';
END $$;
