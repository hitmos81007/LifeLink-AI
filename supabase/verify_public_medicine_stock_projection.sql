-- Run after the public-directory wrapper migrations.
-- Read-only check of the restricted raw projection and the public response shape.
DO $$
DECLARE
  v_definition text;
  v_start integer;
  v_end integer;
  v_medicine_projection text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_resource_directory_unthresholded()'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Restricted raw public resource directory implementation is missing';
  END IF;

  v_start := position('FROM public.medicine_inventory m' IN v_definition);
  IF v_start = 0 THEN
    RAISE EXCEPTION 'Medicine projection was not found in the public directory RPC';
  END IF;

  v_end := position(') medicines ON true' IN substring(v_definition FROM v_start));
  IF v_end = 0 THEN
    RAISE EXCEPTION 'Medicine projection boundary was not found in the public directory RPC';
  END IF;
  v_medicine_projection := substring(v_definition FROM v_start FOR v_end);

  IF position('GREATEST(i.current_stock, 0)' IN v_medicine_projection) = 0
     OR position('i.current_stock -' IN v_medicine_projection) > 0 THEN
    RAISE EXCEPTION 'Public medicine quantity must use nonnegative current_stock without deducting transfer holds twice';
  END IF;

END;
$$;

WITH directory AS (
  SELECT public.get_public_resource_directory() AS payload
)
SELECT jsonb_array_length(payload->'hospitals') AS hospital_count
FROM directory;
