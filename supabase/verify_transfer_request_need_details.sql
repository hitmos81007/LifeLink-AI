DO $$
DECLARE
  v_signature REGPROCEDURE := to_regprocedure('public.request_inbound_resource_transfer_with_details(uuid,text,text,integer,jsonb,uuid,timestamp with time zone,text,text)');
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Detailed inbound transfer request RPC is missing';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='resource_transfers'
        AND column_name='needed_by' AND data_type='timestamp with time zone'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='resource_transfers'
        AND column_name='urgency' AND data_type='text'
    ) OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='resource_transfers'
        AND column_name='reason_category' AND data_type='text'
    ) THEN
    RAISE EXCEPTION 'One or more transfer detail columns are missing';
  END IF;
  IF NOT has_function_privilege('authenticated', v_signature, 'EXECUTE')
     OR has_function_privilege('anon', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'Detailed transfer RPC grants do not match the expected roles';
  END IF;
  RAISE NOTICE 'Transfer request deadline, logistics urgency, and reason category are installed with the expected authenticated-only RPC grant.';
END;
$$;
