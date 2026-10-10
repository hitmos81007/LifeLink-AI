-- Run after 20261007150000_require_active_hospital_transfer_accounts.sql is applied.
-- Read-only function catalog check; does not create users or transfer records.
DO $$
DECLARE
  v_rpc regprocedure := to_regprocedure('public.request_resource_transfer(uuid,text,text,integer,text,uuid)');
  v_internal regprocedure := to_regprocedure('public.request_resource_transfer_internal(uuid,text,text,integer,text,uuid)');
  v_definition text;
  v_wrapper_definition text;
  v_insert_position integer;
  v_identity_check_position integer;
BEGIN
  IF v_rpc IS NULL OR v_internal IS NULL THEN RAISE EXCEPTION 'Resource transfer request RPC or protected implementation is missing'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_rpc) THEN
    RAISE EXCEPTION 'Transfer request RPC must derive authority in SECURITY DEFINER code';
  END IF;
  IF NOT has_function_privilege('authenticated',v_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated transfer request execution grant is missing';
  END IF;
  IF has_function_privilege('anon',v_rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute transfer requests';
  END IF;

  IF has_function_privilege('authenticated',v_internal,'EXECUTE') OR has_function_privilege('anon',v_internal,'EXECUTE') THEN
    RAISE EXCEPTION 'API roles must not directly execute the internal transfer request implementation';
  END IF;
  v_wrapper_definition := pg_get_functiondef(v_rpc);
  IF position('hospital_admin' IN v_wrapper_definition)=0 OR
     position('v_user.status IS DISTINCT FROM true' IN v_wrapper_definition)=0 OR
     position('request_resource_transfer_internal' IN v_wrapper_definition)=0 THEN
    RAISE EXCEPTION 'Transfer request wrapper must require an active hospital administrator';
  END IF;
  v_definition := pg_get_functiondef(v_internal);
  v_insert_position := position('INSERT INTO public.resource_transfers' IN v_definition);
  v_identity_check_position := position('v_source_medicine.unit IS DISTINCT FROM v_destination_medicine.unit' IN v_definition);
  IF position('hospital_admin' IN v_definition)=0 OR
     position('auth.uid()' IN v_definition)=0 OR
     position('icu_inventory' IN v_definition)=0 OR
     position('general_bed_inventory' IN v_definition)=0 OR
     position('oxygen_inventory' IN v_definition)=0 OR
     position('medicine_inventory' IN v_definition)=0 OR
     position('v_destination_matches<>1' IN v_definition)=0 OR
     position('v_source_matches<>1' IN v_definition)=0 OR
     position('v_source_oxygen.unit IS DISTINCT FROM v_destination_oxygen.unit' IN v_definition)=0 OR
     v_identity_check_position=0 OR
     position('v_source_medicine.expiry_date IS DISTINCT FROM v_destination_medicine.expiry_date' IN v_definition)=0 OR
     v_insert_position=0 OR position('v_destination_matches<>1' IN v_definition)>v_insert_position OR
     position('v_source_matches<>1' IN v_definition)>v_insert_position OR
     position('v_source_oxygen.unit IS DISTINCT FROM v_destination_oxygen.unit' IN v_definition)>v_insert_position OR
     v_identity_check_position>v_insert_position THEN
    RAISE EXCEPTION 'Active role-derived authority and exact compatible source/destination inventory validation before insert are required';
  END IF;
  RAISE NOTICE 'Transfer destination inventory catalog checks passed. Exercise each category with synthetic accounts before deployment.';
END $$;
