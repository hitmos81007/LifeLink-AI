-- Run after 20261017140000_seed_synthetic_disease_watch_tier.sql.
-- Read-only check that the synthetic data exercises elevated and watch tiers.
DO $$
DECLARE
  v_recent numeric;
  v_baseline numeric;
  v_recent_days bigint;
  v_baseline_days bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.synthetic_disease_observations
    WHERE district='Synthetic district A' AND syndrome='Respiratory'
      AND observed_on BETWEEN current_date - 6 AND current_date
    GROUP BY district, syndrome HAVING sum(case_count) >= 60
  ) THEN
    RAISE EXCEPTION 'Seeded respiratory series no longer exercises the elevated threshold';
  END IF;

  SELECT count(*), COALESCE(sum(case_count), 0)::numeric / 7
    INTO v_recent_days, v_recent
  FROM public.synthetic_disease_observations
  WHERE district='Synthetic district B' AND syndrome='Gastrointestinal'
    AND observed_on BETWEEN current_date - 6 AND current_date;
  SELECT count(*), COALESCE(sum(case_count), 0)::numeric / 21
    INTO v_baseline_days, v_baseline
  FROM public.synthetic_disease_observations
  WHERE district='Synthetic district B' AND syndrome='Gastrointestinal'
    AND observed_on BETWEEN current_date - 27 AND current_date - 7;

  IF v_recent_days <> 7 OR v_baseline_days <> 21 OR v_recent < 3 OR v_baseline <= 0
     OR (v_recent - v_baseline) / v_baseline < 0.5
     OR (v_recent - v_baseline) / v_baseline >= 1.0 THEN
    RAISE EXCEPTION 'Seeded gastrointestinal series does not exercise the watch tier: recent %, baseline %', v_recent, v_baseline;
  END IF;

  RAISE NOTICE 'Synthetic data exercises both elevated and watch thresholds';
END;
$$;
