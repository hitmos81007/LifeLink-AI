-- Durable, deduplicated resource risk alerts with an append-only action history.
-- Thresholds are configured on each inventory row; alert state and its action
-- history are database-owned and role-scoped.
BEGIN;

ALTER TABLE public.icu_inventory
  ADD COLUMN IF NOT EXISTS minimum_icu_beds INTEGER NOT NULL DEFAULT 0 CHECK (minimum_icu_beds >= 0);
ALTER TABLE public.general_bed_inventory
  ADD COLUMN IF NOT EXISTS minimum_beds INTEGER NOT NULL DEFAULT 0 CHECK (minimum_beds >= 0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.icu_inventory'::regclass AND conname='icu_minimum_beds_within_capacity_check') THEN
    ALTER TABLE public.icu_inventory ADD CONSTRAINT icu_minimum_beds_within_capacity_check CHECK (minimum_icu_beds <= total_icu_beds);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.general_bed_inventory'::regclass AND conname='general_minimum_beds_within_capacity_check') THEN
    ALTER TABLE public.general_bed_inventory ADD CONSTRAINT general_minimum_beds_within_capacity_check CHECK (minimum_beds <= total_beds);
  END IF;
END $$;
GRANT UPDATE (minimum_icu_beds) ON public.icu_inventory TO authenticated;
GRANT UPDATE (minimum_beds) ON public.general_bed_inventory TO authenticated;
GRANT INSERT (minimum_icu_beds) ON public.icu_inventory TO authenticated;
GRANT INSERT (minimum_beds) ON public.general_bed_inventory TO authenticated;

CREATE TABLE IF NOT EXISTS public.risk_alerts (
  alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID REFERENCES public.hospitals(hospital_id) ON DELETE RESTRICT,
  blood_bank_id UUID REFERENCES public.blood_banks(blood_bank_id) ON DELETE RESTRICT,
  facility_name TEXT NOT NULL CHECK (length(facility_name) BETWEEN 1 AND 160),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('Blood','Oxygen','Medicine','ICU Beds','General Beds')),
  resource_id UUID NOT NULL,
  resource_name TEXT NOT NULL CHECK (length(resource_name) BETWEEN 1 AND 120),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('informational','warning','critical')),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('below_threshold','at_zero','forecast_pressure','forecast_shortage')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  observed_value NUMERIC NOT NULL CHECK (observed_value >= 0),
  threshold_value NUMERIC NOT NULL CHECK (threshold_value >= 0),
  predicted_value NUMERIC CHECK (predicted_value IS NULL OR predicted_value >= 0),
  forecast_horizon_days SMALLINT CHECK (forecast_horizon_days IS NULL OR forecast_horizon_days IN (1,7)),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  recommended_action TEXT NOT NULL CHECK (length(recommended_action) BETWEEN 1 AND 300),
  dedupe_key TEXT NOT NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMPTZ,
  resolution_note TEXT,
  resolved_by UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (resource_type='Blood' AND blood_bank_id IS NOT NULL AND hospital_id IS NULL)
    OR (resource_type<>'Blood' AND hospital_id IS NOT NULL AND blood_bank_id IS NULL)
  ),
  CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL)),
  CHECK ((predicted_value IS NULL) = (forecast_horizon_days IS NULL)),
  CHECK (status <> 'acknowledged' OR acknowledged_at IS NOT NULL),
  CHECK ((status IN ('resolved','dismissed')) = (resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS risk_alerts_active_dedupe_uidx
  ON public.risk_alerts(dedupe_key) WHERE status IN ('open','acknowledged');
CREATE INDEX IF NOT EXISTS risk_alerts_hospital_status_idx
  ON public.risk_alerts(hospital_id,status,last_detected_at DESC);
CREATE INDEX IF NOT EXISTS risk_alerts_blood_bank_status_idx
  ON public.risk_alerts(blood_bank_id,status,last_detected_at DESC);

CREATE TABLE IF NOT EXISTS public.alert_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.risk_alerts(alert_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('opened','refreshed','acknowledged','resolved','dismissed','auto_resolved','reopened')),
  actor_id UUID REFERENCES public.users(user_id) ON DELETE RESTRICT,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_events_alert_time_idx ON public.alert_events(alert_id,occurred_at DESC);

ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.risk_alerts, public.alert_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.risk_alerts, public.alert_events TO authenticated;
DROP POLICY IF EXISTS risk_alerts_scope_read ON public.risk_alerts;
CREATE POLICY risk_alerts_scope_read ON public.risk_alerts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.users u WHERE u.user_id=auth.uid() AND u.status IS TRUE
    AND (u.role::text='government_admin'
      OR (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id=risk_alerts.hospital_id)
      OR (u.role::text='blood_bank_admin' AND u.blood_bank_id=risk_alerts.blood_bank_id))
));
DROP POLICY IF EXISTS alert_events_scope_read ON public.alert_events;
CREATE POLICY alert_events_scope_read ON public.alert_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_alerts a JOIN public.users u ON u.user_id=auth.uid()
  WHERE a.alert_id=alert_events.alert_id AND u.status IS TRUE
    AND (u.role::text='government_admin'
      OR (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id=a.hospital_id)
      OR (u.role::text='blood_bank_admin' AND u.blood_bank_id=a.blood_bank_id))
));

CREATE OR REPLACE FUNCTION public.refresh_inventory_risk_alert(
  p_hospital_id UUID, p_blood_bank_id UUID, p_facility_name TEXT,
  p_resource_type TEXT, p_resource_id UUID, p_resource_name TEXT,
  p_observed NUMERIC, p_threshold NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_key TEXT := lower(p_resource_type)||':'||p_resource_id::text;
  v_level TEXT;
  v_id UUID;
  v_action TEXT;
BEGIN
  IF p_observed IS NULL OR p_threshold IS NULL OR p_observed < 0 OR p_threshold < 0 THEN
    RAISE EXCEPTION 'Risk alert values must be known and non-negative';
  END IF;

  IF p_observed <= p_threshold THEN
    v_level := CASE WHEN p_observed=0 THEN 'critical' ELSE 'warning' END;
    INSERT INTO public.risk_alerts(
      hospital_id,blood_bank_id,facility_name,resource_type,resource_id,resource_name,risk_level,reason_code,status,
      observed_value,threshold_value,predicted_value,forecast_horizon_days,reason,recommended_action,dedupe_key
    ) VALUES (
      p_hospital_id,p_blood_bank_id,left(p_facility_name,160),p_resource_type,p_resource_id,left(p_resource_name,120),v_level,
      CASE WHEN p_observed=0 THEN 'at_zero' ELSE 'below_threshold' END,'open',
      p_observed,p_threshold,NULL,NULL,
      format('%s availability is %s, at or below the configured minimum of %s.',left(p_resource_name,120),p_observed,p_threshold),
      'Verify the inventory entry and review safe replenishment or a transfer with an authorised colleague.',v_key
    )
    ON CONFLICT (dedupe_key) WHERE status IN ('open','acknowledged') DO UPDATE SET
      facility_name=EXCLUDED.facility_name,resource_name=EXCLUDED.resource_name,risk_level=EXCLUDED.risk_level,
      reason_code=EXCLUDED.reason_code,observed_value=EXCLUDED.observed_value,
      threshold_value=EXCLUDED.threshold_value,predicted_value=NULL,forecast_horizon_days=NULL,reason=EXCLUDED.reason,
      last_detected_at=now(),updated_at=now()
    RETURNING alert_id INTO v_id;

    SELECT CASE WHEN first_detected_at=last_detected_at THEN 'opened' ELSE 'refreshed' END
      INTO v_action FROM public.risk_alerts WHERE alert_id=v_id;
    INSERT INTO public.alert_events(alert_id,action,actor_id,note)
      VALUES(v_id,v_action,NULL,'Generated from a saved inventory change.');
  ELSE
    UPDATE public.risk_alerts SET status='resolved',resolved_at=now(),resolved_by=NULL,
      resolution_note='Inventory recovered above its configured minimum.',updated_at=now()
      WHERE dedupe_key=v_key AND status IN ('open','acknowledged')
      RETURNING alert_id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO public.alert_events(alert_id,action,actor_id,note)
        VALUES(v_id,'auto_resolved',NULL,'Inventory recovered above its configured minimum.');
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_inventory_risk_alert(UUID,UUID,TEXT,TEXT,UUID,TEXT,NUMERIC,NUMERIC) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.capture_inventory_risk_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_row JSONB := to_jsonb(NEW);
  v_available NUMERIC;
  v_threshold NUMERIC;
  v_name TEXT;
  v_hospital_id UUID;
  v_blood_bank_id UUID;
  v_facility_name TEXT;
BEGIN
  IF TG_ARGV[0]='Blood' THEN
    v_available := GREATEST(COALESCE((v_row->>'available_units')::numeric,0)-COALESCE((v_row->>'reserved_units')::numeric,0)-COALESCE((v_row->>'expired_units')::numeric,0),0);
    v_threshold := COALESCE((v_row->>'minimum_threshold')::numeric,0);
    v_name := 'Blood group '||COALESCE(v_row->>'blood_group','unknown');
    v_blood_bank_id := (v_row->>'blood_bank_id')::uuid;
    SELECT blood_bank_name INTO v_facility_name FROM public.blood_banks WHERE blood_bank_id=v_blood_bank_id;
  ELSIF TG_ARGV[0]='Oxygen' THEN
    v_hospital_id := (v_row->>'hospital_id')::uuid;
    v_available := (v_row->>'available_capacity')::numeric;
    v_threshold := (v_row->>'minimum_threshold')::numeric;
    v_name := COALESCE(v_row->>'oxygen_type','Oxygen')||' ('||COALESCE(v_row->>'unit','unit')||')';
  ELSIF TG_ARGV[0]='Medicine' THEN
    v_hospital_id := (v_row->>'hospital_id')::uuid;
    v_available := (v_row->>'current_stock')::numeric;
    v_threshold := (v_row->>'minimum_stock')::numeric;
    v_name := COALESCE(v_row->>'medicine_name','Medicine');
  ELSIF TG_ARGV[0]='ICU Beds' THEN
    v_hospital_id := (v_row->>'hospital_id')::uuid;
    v_available := (v_row->>'available_icu_beds')::numeric;
    v_threshold := COALESCE((v_row->>'minimum_icu_beds')::numeric,0);
    v_name := 'ICU beds';
  ELSE
    v_hospital_id := (v_row->>'hospital_id')::uuid;
    v_available := (v_row->>'available_beds')::numeric;
    v_threshold := COALESCE((v_row->>'minimum_beds')::numeric,0);
    v_name := 'General beds';
  END IF;

  IF v_hospital_id IS NOT NULL THEN
    SELECT hospital_name INTO v_facility_name FROM public.hospitals WHERE hospital_id=v_hospital_id;
  END IF;

  PERFORM public.refresh_inventory_risk_alert(
    v_hospital_id,v_blood_bank_id,v_facility_name,TG_ARGV[0],(v_row->>TG_ARGV[1])::uuid,
    v_name,v_available,v_threshold
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_inventory_risk_alert() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS risk_alert_blood_inventory ON public.blood_inventory;
CREATE TRIGGER risk_alert_blood_inventory AFTER INSERT OR UPDATE OF available_units,reserved_units,expired_units,minimum_threshold ON public.blood_inventory
FOR EACH ROW EXECUTE FUNCTION public.capture_inventory_risk_alert('Blood','inventory_id');
DROP TRIGGER IF EXISTS risk_alert_oxygen_inventory ON public.oxygen_inventory;
CREATE TRIGGER risk_alert_oxygen_inventory AFTER INSERT OR UPDATE OF available_capacity,minimum_threshold ON public.oxygen_inventory
FOR EACH ROW EXECUTE FUNCTION public.capture_inventory_risk_alert('Oxygen','oxygen_inventory_id');
DROP TRIGGER IF EXISTS risk_alert_medicine_inventory ON public.medicine_inventory;
CREATE TRIGGER risk_alert_medicine_inventory AFTER INSERT OR UPDATE OF current_stock,minimum_stock ON public.medicine_inventory
FOR EACH ROW EXECUTE FUNCTION public.capture_inventory_risk_alert('Medicine','medicine_inventory_id');
DROP TRIGGER IF EXISTS risk_alert_icu_inventory ON public.icu_inventory;
CREATE TRIGGER risk_alert_icu_inventory AFTER INSERT OR UPDATE OF available_icu_beds,minimum_icu_beds ON public.icu_inventory
FOR EACH ROW EXECUTE FUNCTION public.capture_inventory_risk_alert('ICU Beds','icu_inventory_id');
DROP TRIGGER IF EXISTS risk_alert_general_bed_inventory ON public.general_bed_inventory;
CREATE TRIGGER risk_alert_general_bed_inventory AFTER INSERT OR UPDATE OF available_beds,minimum_beds ON public.general_bed_inventory
FOR EACH ROW EXECUTE FUNCTION public.capture_inventory_risk_alert('General Beds','bed_inventory_id');

-- Only persisted synthetic 24-hour/7-day bed estimates may create forecast alerts.
-- Forecast pressure remains an advisory; it never reserves or moves resources.
CREATE OR REPLACE FUNCTION public.capture_synthetic_forecast_risk_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_facility_name TEXT;
  v_key TEXT;
  v_level TEXT;
  v_reason_code TEXT;
  v_id UUID;
  v_action TEXT;
  v_horizon_label TEXT;
BEGIN
  IF NEW.forecast_run_id IS NULL
     OR NEW.prediction_model::text <> 'SyntheticRequestRate'
     OR NEW.input_snapshot->>'data_origin' IS DISTINCT FROM 'synthetic'
     OR NEW.forecast_horizon_days NOT IN (1,7)
     OR NEW.resource_type::text NOT IN ('ICU Beds','General Beds') THEN
    RETURN NEW;
  END IF;

  SELECT hospital_name INTO v_facility_name FROM public.hospitals
    WHERE hospital_id=NEW.hospital_id AND status::text='Active';
  IF v_facility_name IS NULL THEN RETURN NEW; END IF;

  v_key := 'forecast:'||NEW.hospital_id::text||':'||NEW.resource_type::text||':'||NEW.forecast_horizon_days::text;
  -- Ignore delayed history writes when a newer estimate has already been
  -- handled, including when that newer alert was resolved or dismissed.
  IF EXISTS (
    SELECT 1 FROM public.risk_alerts
    WHERE dedupe_key=v_key AND last_detected_at > NEW.created_at
  ) THEN
    RETURN NEW;
  END IF;
  v_horizon_label := CASE WHEN NEW.forecast_horizon_days=1 THEN '24-hour' ELSE '7-day' END;
  IF NEW.predicted_demand > NEW.current_quantity THEN
    v_level := CASE
      WHEN NEW.current_quantity=0 OR (NEW.forecast_horizon_days=1 AND NEW.predicted_demand >= NEW.current_quantity * 1.5) THEN 'critical'
      ELSE 'warning' END;
    v_reason_code := 'forecast_shortage';
  ELSIF NEW.current_quantity > 0 AND NEW.predicted_demand >= NEW.current_quantity * 0.8 THEN
    v_level := 'informational';
    v_reason_code := 'forecast_pressure';
  ELSE
    UPDATE public.risk_alerts SET status='resolved',resolved_at=now(),resolved_by=NULL,
      resolution_note='The latest synthetic forecast no longer shows near-term capacity pressure.',updated_at=now()
      WHERE dedupe_key=v_key AND status IN ('open','acknowledged') AND last_detected_at <= NEW.created_at
      RETURNING alert_id INTO v_id;
    IF v_id IS NOT NULL THEN
      INSERT INTO public.alert_events(alert_id,action,actor_id,note)
        VALUES(v_id,'auto_resolved',NULL,'The latest synthetic forecast no longer shows near-term capacity pressure.');
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.risk_alerts(
    hospital_id,facility_name,resource_type,resource_id,resource_name,risk_level,reason_code,status,
    observed_value,threshold_value,predicted_value,forecast_horizon_days,reason,recommended_action,dedupe_key,
    first_detected_at,last_detected_at
  ) VALUES (
    NEW.hospital_id,left(v_facility_name,160),NEW.resource_type::text,NEW.prediction_id,
    NEW.resource_type::text,v_level,v_reason_code,'open',NEW.current_quantity,NEW.current_quantity,
    NEW.predicted_demand,NEW.forecast_horizon_days,
    format('Synthetic %s demand estimate is %s versus %s recorded available units at generation. This is an illustrative rate, not a validated prediction.',v_horizon_label,NEW.predicted_demand,NEW.current_quantity),
    'Review the forecast assumptions and current inventory with an authorised colleague; no resource was reserved or moved.',v_key,
    NEW.created_at,NEW.created_at
  )
  ON CONFLICT (dedupe_key) WHERE status IN ('open','acknowledged') DO UPDATE SET
    facility_name=EXCLUDED.facility_name,resource_id=EXCLUDED.resource_id,resource_name=EXCLUDED.resource_name,
    risk_level=EXCLUDED.risk_level,reason_code=EXCLUDED.reason_code,
    observed_value=EXCLUDED.observed_value,threshold_value=EXCLUDED.threshold_value,
    predicted_value=EXCLUDED.predicted_value,forecast_horizon_days=EXCLUDED.forecast_horizon_days,
    reason=EXCLUDED.reason,last_detected_at=EXCLUDED.last_detected_at,updated_at=now()
  WHERE public.risk_alerts.last_detected_at <= EXCLUDED.last_detected_at
  RETURNING alert_id INTO v_id;

  IF v_id IS NULL THEN RETURN NEW; END IF;
  SELECT CASE WHEN first_detected_at=last_detected_at THEN 'opened' ELSE 'refreshed' END
    INTO v_action FROM public.risk_alerts WHERE alert_id=v_id;
  INSERT INTO public.alert_events(alert_id,action,actor_id,note)
    VALUES(v_id,v_action,NULL,'Generated from a saved synthetic forecast.');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_synthetic_forecast_risk_alert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS risk_alert_synthetic_bed_forecast ON public.prediction_history;
CREATE TRIGGER risk_alert_synthetic_bed_forecast
AFTER INSERT OR UPDATE OF current_quantity,predicted_demand,forecast_run_id,forecast_horizon_days,input_snapshot
ON public.prediction_history FOR EACH ROW EXECUTE FUNCTION public.capture_synthetic_forecast_risk_alert();

CREATE OR REPLACE FUNCTION public.transition_risk_alert(p_alert_id UUID,p_action TEXT,p_note TEXT DEFAULT NULL)
RETURNS public.risk_alerts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_user public.users; v_alert public.risk_alerts; v_old_status TEXT; v_note TEXT := NULLIF(btrim(p_note),'');
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.status IS DISTINCT FROM true OR v_user.role::text NOT IN ('government_admin','hospital_admin','hospital_approver','blood_bank_admin') THEN
    RAISE EXCEPTION 'An active authorised operations account is required';
  END IF;
  SELECT * INTO v_alert FROM public.risk_alerts WHERE alert_id=p_alert_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Risk alert not found'; END IF;
  v_old_status := v_alert.status;
  IF v_user.role::text='blood_bank_admin' AND v_user.blood_bank_id IS DISTINCT FROM v_alert.blood_bank_id THEN
    RAISE EXCEPTION 'You cannot change another blood bank risk alert';
  ELSIF v_user.role::text IN ('hospital_admin','hospital_approver') AND v_user.hospital_id IS DISTINCT FROM v_alert.hospital_id THEN
    RAISE EXCEPTION 'You cannot change another hospital risk alert';
  END IF;
  IF p_action NOT IN ('acknowledged','resolved','dismissed') THEN RAISE EXCEPTION 'Choose acknowledge, resolve, or dismiss'; END IF;
  IF v_alert.status NOT IN ('open','acknowledged') THEN RAISE EXCEPTION 'Only open alerts can be changed'; END IF;
  IF p_action='resolved' AND v_note IS NULL THEN RAISE EXCEPTION 'A resolution note is required'; END IF;
  IF p_action='dismissed' AND v_alert.risk_level='critical' AND v_note IS NULL THEN
    RAISE EXCEPTION 'A reason is required to dismiss this alert';
  END IF;
  IF v_note IS NOT NULL AND v_note NOT IN (
    'Inventory verified', 'Restock or transfer requested', 'Inventory count corrected',
    'Duplicate alert', 'Expected synthetic scenario threshold', 'Condition cleared',
    'Source data checked'
  ) THEN RAISE EXCEPTION 'Choose an approved note; do not enter patient or contact details'; END IF;

  UPDATE public.risk_alerts SET status=p_action,
    acknowledged_by=CASE WHEN p_action='acknowledged' THEN v_user.user_id ELSE acknowledged_by END,
    acknowledged_at=CASE WHEN p_action='acknowledged' THEN now() ELSE acknowledged_at END,
    resolved_by=CASE WHEN p_action IN ('resolved','dismissed') THEN v_user.user_id ELSE NULL END,
    resolved_at=CASE WHEN p_action IN ('resolved','dismissed') THEN now() ELSE NULL END,
    resolution_note=CASE WHEN p_action IN ('resolved','dismissed') THEN v_note ELSE resolution_note END,
    updated_at=now()
    WHERE alert_id=p_alert_id RETURNING * INTO v_alert;
  INSERT INTO public.alert_events(alert_id,action,actor_id,note)
    VALUES(v_alert.alert_id,p_action,v_user.user_id,v_note);
  INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_value,new_value,created_at)
    VALUES(v_user.user_id,'RISK_ALERT_'||upper(p_action),'risk_alerts',v_alert.alert_id,
      jsonb_build_object('status',v_old_status),
      jsonb_build_object('status',p_action,'note',v_note),now());
  RETURN v_alert;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_risk_alert(UUID,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_risk_alert(UUID,TEXT,TEXT) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='risk_alerts') IS FALSE THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.risk_alerts';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='alert_events') IS FALSE THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_events';
  END IF;
END $$;

COMMIT;
