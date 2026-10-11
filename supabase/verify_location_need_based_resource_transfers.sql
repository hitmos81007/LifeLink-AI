-- Read-only catalog verification for the location-based transfer migrations.
-- Creates no users, requests, or inventory rows.
DO $$
DECLARE
  v_discovery REGPROCEDURE := to_regprocedure('public.find_nearby_transfer_sources(text)');
  v_filtered_discovery REGPROCEDURE := to_regprocedure('public.find_nearby_transfer_sources(text,numeric)');
  v_request REGPROCEDURE := to_regprocedure('public.request_inbound_resource_transfer(uuid,text,text,integer,jsonb,uuid)');
  v_transition REGPROCEDURE := to_regprocedure('public.transition_resource_transfer_internal(uuid,text,integer,text)');
  v_discovery_definition TEXT;
  v_filtered_discovery_definition TEXT;
  v_request_definition TEXT;
  v_transition_definition TEXT;
BEGIN
  IF v_discovery IS NULL OR v_filtered_discovery IS NULL OR v_request IS NULL OR v_transition IS NULL THEN
    RAISE EXCEPTION 'Location-based source discovery, inbound request, or transition implementation is missing';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_discovery)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_filtered_discovery)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_request) THEN
    RAISE EXCEPTION 'Location-based discovery and request RPCs must enforce authority in SECURITY DEFINER code';
  END IF;
  IF NOT has_function_privilege('authenticated',v_discovery,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_filtered_discovery,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_request,'EXECUTE')
     OR has_function_privilege('anon',v_discovery,'EXECUTE')
     OR has_function_privilege('anon',v_filtered_discovery,'EXECUTE')
     OR has_function_privilege('anon',v_request,'EXECUTE') THEN
    RAISE EXCEPTION 'Location-based RPC privileges must be authenticated-only';
  END IF;

  v_filtered_discovery_definition:=pg_get_functiondef(v_filtered_discovery);
  IF position('p_max_distance_km' IN v_filtered_discovery_definition)=0
     OR position('c.distance_km<=p_max_distance_km' IN v_filtered_discovery_definition)=0
     OR position('last_reported_at' IN pg_get_function_result(v_filtered_discovery))=0
     OR position('updated_at' IN v_filtered_discovery_definition)=0 THEN
    RAISE EXCEPTION 'Filtered donor discovery must apply the selected radius and return source inventory freshness';
  END IF;

  v_discovery_definition:=pg_get_functiondef(v_discovery);
  IF position('v_user.role::text<>''hospital_admin''' IN v_discovery_definition)=0
     OR position('v_user.status IS DISTINCT FROM true' IN v_discovery_definition)=0
     OR position('i.available_icu_beds-i.minimum_icu_beds' IN v_discovery_definition)=0
     OR position('i.available_beds-i.minimum_beds' IN v_discovery_definition)=0
     OR position('i.available_capacity-i.minimum_threshold' IN v_discovery_definition)=0
     OR position('i.current_stock-i.minimum_stock' IN v_discovery_definition)=0
     OR position('i.expiry_date>=CURRENT_DATE' IN v_discovery_definition)=0
     OR position('ORDER BY l.distance NULLS LAST' IN v_discovery_definition)=0 THEN
    RAISE EXCEPTION 'Donor discovery must be role-scoped, omit protected stock, exclude expired medicine, and rank by distance';
  END IF;

  v_request_definition:=pg_get_functiondef(v_request);
  IF position('auth.uid()' IN v_request_definition)=0
     OR position('v_user.role::text<>''hospital_admin''' IN v_request_definition)=0
     OR position('v_user.status IS DISTINCT FROM true' IN v_request_definition)=0
     OR position('v_user.hospital_id' IN v_request_definition)=0
     OR position('v_available-v_minimum<p_quantity' IN v_request_definition)=0
     OR position('p_resource_identity' IN v_request_definition)=0
     OR position('INSERT INTO public.icu_inventory' IN v_request_definition)=0
     OR position('INSERT INTO public.general_bed_inventory' IN v_request_definition)=0
     OR position('INSERT INTO public.oxygen_inventory' IN v_request_definition)=0
     OR position('INSERT INTO public.medicine_inventory' IN v_request_definition)=0
     OR position('INSERT INTO public.resource_transfer_events' IN v_request_definition)=0 THEN
    RAISE EXCEPTION 'Inbound requests must derive the receiver from auth, validate source stock and identity, seed a missing receiver catalog row, and record the initial event';
  END IF;

  v_transition_definition:=pg_get_functiondef(v_transition);
  IF position('available_icu_beds,minimum_icu_beds INTO v_available,v_minimum' IN v_transition_definition)=0
     OR position('available_beds,minimum_beds INTO v_available,v_minimum' IN v_transition_definition)=0 THEN
    RAISE EXCEPTION 'Source bed protected minimums must be rechecked at approval time';
  END IF;
  RAISE NOTICE 'Location-based transfer catalog and privilege checks passed.';
END;
$$;
