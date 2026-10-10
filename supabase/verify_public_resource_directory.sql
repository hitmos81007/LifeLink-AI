-- Run after 20261007230000_public_resource_directory.sql.
DO $$
DECLARE
  v_result jsonb;
BEGIN
  IF to_regprocedure('public.get_public_resource_directory()') IS NULL
     OR NOT has_function_privilege('anon', 'public.get_public_resource_directory()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_public_resource_directory()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public resource directory RPC is missing or not granted to its intended roles';
  END IF;

  v_result := public.get_public_resource_directory();
  IF jsonb_typeof(v_result) <> 'object'
     OR NOT (v_result ? 'hospitals')
     OR NOT (v_result ? 'blood_banks')
     OR NOT (v_result ? 'ambulance_providers') THEN
    RAISE EXCEPTION 'Public resource directory response is missing an expected resource group';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'hospitals') h
    GROUP BY h->>'id' HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'blood_banks') b
    GROUP BY b->>'id' HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'ambulance_providers') a
    GROUP BY a->>'id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Public resource directory returned the same facility or provider more than once';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'hospitals') h
    WHERE h ?| ARRAY['email','reserved_units','reserved_stock','minimum_threshold','minimum_stock','driver_name','driver_phone']
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(h->'oxygen','[]'::jsonb)) x WHERE x ?| ARRAY['minimum_threshold','reserved_units'])
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(h->'medicines','[]'::jsonb)) x WHERE x ?| ARRAY['manufacturer','expiry_date','reserved_stock','minimum_stock'])
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'blood_banks') b
    WHERE b ?| ARRAY['email','reserved_units','minimum_threshold']
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(b->'stock','[]'::jsonb)) x WHERE x ?| ARRAY['reserved_units','minimum_threshold'])
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'ambulance_providers') a
    WHERE a ?| ARRAY['vehicle_number','driver_name','driver_phone','ambulance_id']
  ) THEN
    RAISE EXCEPTION 'Public resource directory exposed a non-public or operationally sensitive field';
  END IF;
END;
$$;

WITH directory AS (
  SELECT public.get_public_resource_directory() AS payload
)
SELECT
  jsonb_array_length(payload->'hospitals') AS hospital_count,
  jsonb_array_length(payload->'blood_banks') AS blood_bank_count,
  jsonb_array_length(payload->'ambulance_providers') AS ambulance_provider_count
FROM directory;
