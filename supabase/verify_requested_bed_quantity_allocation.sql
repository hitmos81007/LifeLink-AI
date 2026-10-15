-- Run after 20261017180000_allocate_requested_bed_quantities.sql.
-- Catalog-only verification: no production rows are inserted or changed.
DO $$
DECLARE
  v_approval regprocedure := to_regprocedure(
    'public.approve_emergency_request(uuid,uuid,uuid,uuid,text)'
  );
  v_allocator regprocedure := to_regprocedure(
    'public.approve_emergency_request_internal(uuid,uuid,uuid,uuid,text)'
  );
  v_network regprocedure := to_regprocedure('public.get_clinician_review_network()');
  v_approval_definition text;
  v_network_definition text;
BEGIN
  IF v_approval IS NULL OR v_allocator IS NULL OR v_network IS NULL THEN
    RAISE EXCEPTION 'Quantity-aware clinician review functions are missing';
  END IF;
  IF NOT has_function_privilege('authenticated', v_approval, 'EXECUTE')
     OR has_function_privilege('anon', v_approval, 'EXECUTE')
     OR has_function_privilege('authenticated', v_allocator, 'EXECUTE')
     OR has_function_privilege('anon', v_allocator, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_network, 'EXECUTE')
     OR has_function_privilege('anon', v_network, 'EXECUTE') THEN
    RAISE EXCEPTION 'Clinician review function privileges are incorrect';
  END IF;

  SELECT pg_get_functiondef(v_approval) INTO v_approval_definition;
  IF position('requested_icu_beds' IN v_approval_definition) = 0
     OR position('requested_general_beds' IN v_approval_definition) = 0
     OR position('minimum_icu_beds' IN v_approval_definition) = 0
     OR position('minimum_beds' IN v_approval_definition) = 0
     OR position('approve_emergency_request_internal' IN v_approval_definition) = 0 THEN
    RAISE EXCEPTION 'Approval does not reserve the requested bed quantities above safety buffers';
  END IF;
  SELECT pg_get_functiondef(v_network) INTO v_network_definition;
  IF position('allocatable_icu_beds' IN v_network_definition) = 0
     OR position('allocatable_general_beds' IN v_network_definition) = 0 THEN
    RAISE EXCEPTION 'Clinician candidates do not expose beds available above safety buffers';
  END IF;
  RAISE NOTICE 'Requested bed quantities, safety buffers, and clinician-only permissions verified';
END;
$$;
