-- Aggregate-only synthetic district trend data for the early-warning demo.
-- No patient-level data or real surveillance feed is used.
BEGIN;

CREATE TABLE IF NOT EXISTS public.synthetic_disease_observations (
  district text NOT NULL CHECK (district IN ('Synthetic district A','Synthetic district B','Synthetic district C')),
  syndrome text NOT NULL CHECK (syndrome IN ('Respiratory','Gastrointestinal','Febrile')),
  observed_on date NOT NULL,
  case_count integer NOT NULL CHECK (case_count >= 0),
  admission_count integer NOT NULL CHECK (admission_count >= 0 AND admission_count <= case_count),
  oxygen_units_consumed integer NOT NULL CHECK (oxygen_units_consumed >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (district, syndrome, observed_on)
);

ALTER TABLE public.synthetic_disease_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.synthetic_disease_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.synthetic_disease_observations TO authenticated;
DROP POLICY IF EXISTS synthetic_disease_observations_government_read ON public.synthetic_disease_observations;
CREATE POLICY synthetic_disease_observations_government_read
  ON public.synthetic_disease_observations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE AND u.role::text = 'government_admin'
  ));

DO $$
DECLARE v_publication_all_tables boolean;
BEGIN
  SELECT puballtables INTO v_publication_all_tables
  FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF FOUND AND NOT v_publication_all_tables AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'synthetic_disease_observations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.synthetic_disease_observations';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_synthetic_disease_demo_internal()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rows integer;
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

CREATE OR REPLACE FUNCTION public.refresh_synthetic_disease_demo()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user public.users; v_rows integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text <> 'government_admin' THEN
    RAISE EXCEPTION 'An active district coordinator account is required';
  END IF;
  v_rows := public.refresh_synthetic_disease_demo_internal();
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id, 'REFRESH_SYNTHETIC_DISEASE_DEMO', 'synthetic_disease_observations', NULL, NULL,
    jsonb_build_object('row_count', v_rows, 'window_days', 28, 'source', 'deterministic synthetic aggregate generator'), now()
  );
  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_synthetic_disease_observations(p_days integer DEFAULT 28)
RETURNS TABLE(
  district text, syndrome text, observed_on date, case_count integer,
  admission_count integer, oxygen_units_consumed integer, generated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user public.users;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text <> 'government_admin' THEN
    RAISE EXCEPTION 'An active district coordinator account is required';
  END IF;
  IF p_days IS NULL OR p_days < 7 OR p_days > 90 THEN
    RAISE EXCEPTION 'Trend window must be between 7 and 90 days';
  END IF;
  RETURN QUERY
    SELECT o.district, o.syndrome, o.observed_on, o.case_count, o.admission_count,
      o.oxygen_units_consumed, o.generated_at
    FROM public.synthetic_disease_observations o
    WHERE o.observed_on BETWEEN current_date - (p_days - 1) AND current_date
    ORDER BY o.district, o.syndrome, o.observed_on;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_synthetic_disease_demo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_synthetic_disease_observations(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_synthetic_disease_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_synthetic_disease_observations(integer) TO authenticated;

-- Seed a known illustrative surge so a freshly migrated demo demonstrates all risk tiers.
SELECT public.refresh_synthetic_disease_demo_internal();

COMMIT;
