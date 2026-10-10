-- Run after 20261008200000_exact_inventory_transfer_identity.sql.
DO $$
DECLARE
  v_request_definition TEXT;
  v_internal_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb)'::regprocedure)
    INTO v_request_definition;
  SELECT pg_get_functiondef('public.request_resource_transfer_with_identity_internal(uuid,text,text,integer,jsonb,uuid)'::regprocedure)
    INTO v_internal_definition;

  IF v_request_definition IS NULL OR v_internal_definition IS NULL THEN
    RAISE EXCEPTION 'Exact inventory transfer RPC functions are missing';
  END IF;
  IF position('request_resource_transfer_with_identity_internal' IN v_request_definition)=0
     OR position('v_user.status IS DISTINCT FROM true' IN v_request_definition)=0 THEN
    RAISE EXCEPTION 'Exact identity RPC wrapper is missing its active-account guard or internal call';
  END IF;
  IF position('resource_identity' IN v_internal_definition)=0
     OR position('destination_inventory_id' IN v_internal_definition)=0
     OR position('ON CONFLICT (idempotency_key)' IN v_internal_definition)=0 THEN
    RAISE EXCEPTION 'Exact identity transfer routine is missing identity, destination snapshot, or idempotency validation';
  END IF;
  IF has_function_privilege('anon','public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.request_resource_transfer_with_identity_internal(uuid,text,text,integer,jsonb,uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Exact identity transfer RPC grants violate the authenticated-only boundary';
  END IF;
END;
$$;
