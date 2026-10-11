-- Ensure the synthetic public-health demo exercises both documented warning
-- tiers while keeping every observation fictional and aggregate-only.
BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_synthetic_disease_demo_internal()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM public.synthetic_disease_observations
  WHERE observed_on < current_date - 27;

  WITH districts(district) AS (
    VALUES ('Synthetic district A'), ('Synthetic district B'), ('Synthetic district C')
  ), syndromes(syndrome) AS (
    VALUES ('Respiratory'), ('Gastrointestinal'), ('Febrile')
  ), generated AS (
    SELECT d.district, s.syndrome, current_date - day.day_offset AS observed_on,
      CASE
        WHEN d.district = 'Synthetic district A' AND s.syndrome = 'Respiratory' AND day.day_offset < 7
          THEN 12 + (day.day_offset % 3)
        WHEN d.district = 'Synthetic district B' AND s.syndrome = 'Gastrointestinal' AND day.day_offset < 7
          THEN 8
        ELSE 4 + ((day.day_offset + length(d.district) + length(s.syndrome)) % 3)
      END AS case_count
    FROM districts d CROSS JOIN syndromes s CROSS JOIN generate_series(0, 27) AS day(day_offset)
  )
  INSERT INTO public.synthetic_disease_observations(
    district, syndrome, observed_on, case_count, admission_count, oxygen_units_consumed, generated_at
  )
  SELECT district, syndrome, observed_on, case_count,
    floor(case_count * 0.2)::integer,
    CASE WHEN syndrome = 'Respiratory' THEN case_count * 2 ELSE case_count END,
    now()
  FROM generated
  ON CONFLICT (district, syndrome, observed_on) DO UPDATE SET
    case_count = EXCLUDED.case_count,
    admission_count = EXCLUDED.admission_count,
    oxygen_units_consumed = EXCLUDED.oxygen_units_consumed,
    generated_at = EXCLUDED.generated_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_synthetic_disease_demo_internal() FROM PUBLIC, anon, authenticated;

-- Refresh the deterministic fictional series now so the new watch-tier case is
-- visible immediately after migration, not only after a user presses regenerate.
SELECT public.refresh_synthetic_disease_demo_internal();

COMMIT;
