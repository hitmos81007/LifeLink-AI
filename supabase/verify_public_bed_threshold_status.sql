-- Read-only contract check: public bed status must not say Available at/below
-- its configured protected minimum, and must preserve Unknown when data is absent.
DO $$
DECLARE
  v_directory JSONB;
BEGIN
  IF has_function_privilege('anon','public.get_public_resource_directory()','EXECUTE') IS DISTINCT FROM true
    OR has_function_privilege('authenticated','public.get_public_resource_directory()','EXECUTE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Public directory RPC must remain available to anonymous and authenticated users';
  END IF;
  IF has_function_privilege('anon','public.get_public_resource_directory_unthresholded()','EXECUTE')
    OR has_function_privilege('authenticated','public.get_public_resource_directory_unthresholded()','EXECUTE') THEN
    RAISE EXCEPTION 'Unthresholded internal directory implementation must not be executable by app roles';
  END IF;

  v_directory := public.get_public_resource_directory();

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_directory->'hospitals','[]'::JSONB)) AS item(value)
    JOIN public.icu_inventory i ON i.hospital_id=(item.value->>'id')::UUID
    WHERE item.value->>'icu_beds' IS NOT NULL
      AND item.value->>'icu_status' IS DISTINCT FROM
        (CASE WHEN i.available_icu_beds > i.minimum_icu_beds THEN 'Available' ELSE 'Critical' END)
  ) THEN RAISE EXCEPTION 'Public ICU status disagrees with protected minimum'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_directory->'hospitals','[]'::JSONB)) AS item(value)
    JOIN public.general_bed_inventory i ON i.hospital_id=(item.value->>'id')::UUID
    WHERE item.value->>'general_beds' IS NOT NULL
      AND item.value->>'general_beds_status' IS DISTINCT FROM
        (CASE WHEN i.available_beds > i.minimum_beds THEN 'Available' ELSE 'Critical' END)
  ) THEN RAISE EXCEPTION 'Public general-bed status disagrees with protected minimum'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_directory->'hospitals','[]'::JSONB)) AS item(value)
    WHERE item.value->>'icu_beds' IS NULL AND item.value->>'icu_status' IS DISTINCT FROM 'Unknown'
  ) THEN RAISE EXCEPTION 'Missing ICU inventory must remain Unknown'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_directory->'hospitals','[]'::JSONB)) AS item(value)
    WHERE item.value->>'general_beds' IS NULL AND item.value->>'general_beds_status' IS DISTINCT FROM 'Unknown'
  ) THEN RAISE EXCEPTION 'Missing general-bed inventory must remain Unknown'; END IF;

  RAISE NOTICE 'Public bed status correctly respects protected safety thresholds.';
END $$;
