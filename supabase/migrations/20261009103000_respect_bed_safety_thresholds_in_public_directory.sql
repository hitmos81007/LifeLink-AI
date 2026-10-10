-- Public availability must reflect the configured safety threshold without
-- revealing that threshold. Keep the original restricted projection as an
-- internal implementation detail and adjust only the two public status fields.
BEGIN;

ALTER FUNCTION public.get_public_resource_directory()
  RENAME TO get_public_resource_directory_unthresholded;
REVOKE ALL ON FUNCTION public.get_public_resource_directory_unthresholded()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_public_resource_directory()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_directory JSONB;
  v_hospitals JSONB;
BEGIN
  v_directory := public.get_public_resource_directory_unthresholded();

  SELECT COALESCE(jsonb_agg(
    jsonb_set(
      jsonb_set(item.value, '{icu_status}', to_jsonb(
        CASE
          WHEN item.value->>'icu_beds' IS NULL THEN 'Unknown'
          WHEN (item.value->>'icu_beds')::NUMERIC > COALESCE((
            SELECT max(i.minimum_icu_beds)
            FROM public.icu_inventory i
            WHERE i.hospital_id=(item.value->>'id')::UUID
          ),0) THEN 'Available'
          ELSE 'Critical'
        END
      ), true),
      '{general_beds_status}', to_jsonb(
        CASE
          WHEN item.value->>'general_beds' IS NULL THEN 'Unknown'
          WHEN (item.value->>'general_beds')::NUMERIC > COALESCE((
            SELECT max(i.minimum_beds)
            FROM public.general_bed_inventory i
            WHERE i.hospital_id=(item.value->>'id')::UUID
          ),0) THEN 'Available'
          ELSE 'Critical'
        END
      ), true
    ) ORDER BY item.value->>'name'
  ), '[]'::JSONB)
  INTO v_hospitals
  FROM jsonb_array_elements(COALESCE(v_directory->'hospitals','[]'::JSONB)) AS item(value);

  RETURN jsonb_set(v_directory,'{hospitals}',v_hospitals,true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_resource_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_resource_directory() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
