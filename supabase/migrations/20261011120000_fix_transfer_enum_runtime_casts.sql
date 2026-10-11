-- Keep transfer functions compatible with enum-backed resource_type values.
-- Older stored function bodies compare/COALESCE enums as though they were text.
DO $$
DECLARE
  v_definition TEXT;
  v_signature REGPROCEDURE;
BEGIN
  v_signature := 'public.request_resource_transfer_internal(uuid,text,text,integer,text,uuid)'::REGPROCEDURE;
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('v_transfer.resource_type<>p_resource_type::public.transfer_resource_type::public.transfer_resource_type' IN v_definition) > 0 THEN
    v_definition := replace(
      v_definition,
      'v_transfer.resource_type<>p_resource_type::public.transfer_resource_type::public.transfer_resource_type',
      'v_transfer.resource_type<>p_resource_type::public.transfer_resource_type'
    );
    EXECUTE v_definition;
  ELSIF position('v_transfer.resource_type<>p_resource_type::public.transfer_resource_type' IN v_definition) = 0
    AND position('v_transfer.resource_type<>p_resource_type' IN v_definition) > 0 THEN
    v_definition := replace(
      v_definition,
      'v_transfer.resource_type<>p_resource_type',
      'v_transfer.resource_type<>p_resource_type::public.transfer_resource_type'
    );
    EXECUTE v_definition;
  ELSIF position('v_transfer.resource_type<>p_resource_type::public.transfer_resource_type' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected resource transfer identity check in %', v_signature;
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.request_resource_transfer(uuid,text,text,integer,text,uuid,jsonb)'::REGPROCEDURE,
    'public.transition_resource_transfer(uuid,text,integer,text)'::REGPROCEDURE
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    IF position('COALESCE(v_transfer.resource_name,v_transfer.resource_type)' IN v_definition) > 0 THEN
      v_definition := replace(
        v_definition,
        'COALESCE(v_transfer.resource_name,v_transfer.resource_type)',
        'COALESCE(v_transfer.resource_name,v_transfer.resource_type::text)'
      );
      EXECUTE v_definition;
    ELSIF position('COALESCE(v_transfer.resource_name,v_transfer.resource_type::text)' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected transfer notification fallback in %', v_signature;
    END IF;
  END LOOP;
END;
$$;
