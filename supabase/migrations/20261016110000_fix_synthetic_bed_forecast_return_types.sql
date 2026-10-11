-- Align the saved forecast RPC's query expressions with its declared result types.
BEGIN;

DO $fix$
DECLARE
  v_definition TEXT;
  v_updated TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_latest_synthetic_operational_bed_forecasts(uuid)'::regprocedure)
    INTO v_definition;

  IF position('MAX(d.predicted_demand::NUMERIC)' IN v_definition) = 0
     OR position('p.generated::TIMESTAMPTZ' IN v_definition) = 0 THEN
    v_updated := regexp_replace(v_definition,
      'MAX\s*\(\s*d\.predicted_demand\s*\)\s*FILTER\s*\(\s*WHERE\s*d\.forecast_horizon_days\s*=\s*1\s*\)',
      'MAX(d.predicted_demand::NUMERIC) FILTER (WHERE d.forecast_horizon_days = 1)', 'g');
    v_updated := regexp_replace(v_updated,
      'MAX\s*\(\s*d\.predicted_demand\s*\)\s*FILTER\s*\(\s*WHERE\s*d\.forecast_horizon_days\s*=\s*7\s*\)',
      'MAX(d.predicted_demand::NUMERIC) FILTER (WHERE d.forecast_horizon_days = 7)', 'g');
    v_updated := regexp_replace(v_updated,
      'p\.demand_24h\s*,\s*p\.demand_7d\s*,\s*p\.request_count\s*,\s*p\.method\s*,\s*p\.generated::DATE\s*,\s*p\.generated\y',
      'p.demand_24h::NUMERIC, p.demand_7d::NUMERIC, p.request_count::BIGINT, p.method::TEXT, p.generated::DATE, p.generated::TIMESTAMPTZ', 'g');

    IF v_updated = v_definition
      OR position('MAX(d.predicted_demand::NUMERIC)' IN v_updated) = 0
      OR position('p.generated::TIMESTAMPTZ' IN v_updated) = 0 THEN
      RAISE EXCEPTION 'Forecast function source did not match the expected return expressions; no change applied';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$fix$;

COMMIT;