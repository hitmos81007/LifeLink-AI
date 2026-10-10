-- Run after 20261008170000_transfer_exact_inventory_rows.sql.
DO $$
DECLARE
  v_definition text;
  v_public_definition text;
BEGIN
  SELECT pg_get_functiondef('public.transition_resource_transfer_internal(uuid,text,integer,text)'::regprocedure)
    INTO v_definition;
  SELECT pg_get_functiondef('public.transition_resource_transfer(uuid,text,integer,text)'::regprocedure)
    INTO v_public_definition;

  IF v_definition IS NULL OR v_public_definition IS NULL THEN
    RAISE EXCEPTION 'Transfer transition implementation or public wrapper is missing';
  END IF;

  IF position('WHERE icu_inventory_id=v_source_id' IN v_definition)=0
     OR position('WHERE bed_inventory_id=v_source_id' IN v_definition)=0
     OR position('WHERE oxygen_inventory_id=v_source_id' IN v_definition)=0
     OR position('WHERE medicine_inventory_id=v_source_id' IN v_definition)=0
     OR position('WHERE icu_inventory_id=v_destination_id' IN v_definition)=0
     OR position('WHERE bed_inventory_id=v_destination_id' IN v_definition)=0
     OR position('WHERE oxygen_inventory_id=v_destination_id' IN v_definition)=0
     OR position('WHERE medicine_inventory_id=v_destination_id' IN v_definition)=0 THEN
    RAISE EXCEPTION 'A transfer transition does not update the snapshotted inventory row';
  END IF;

  IF position('resource_identity' IN v_definition)=0
     OR position('FROM public.transition_resource_transfer_internal' IN v_public_definition)=0
     OR has_function_privilege('authenticated','public.transition_resource_transfer_internal(uuid,text,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Transfer transition identity checks or private wrapper boundary are missing';
  END IF;
END;
$$;
