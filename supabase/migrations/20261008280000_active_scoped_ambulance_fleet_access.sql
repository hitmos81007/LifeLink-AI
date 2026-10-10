-- Fleet access requires an active linked account. Do not allow direct vehicle
-- deletion, which would detach a vehicle from emergency-case history.
BEGIN;

ALTER TABLE public.ambulance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ambulance providers read access" ON public.ambulance_providers;
DROP POLICY IF EXISTS "Ambulance providers update access" ON public.ambulance_providers;
CREATE POLICY "Ambulance providers read access"
  ON public.ambulance_providers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND (u.role::text = 'government_admin'
        OR (u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulance_providers.provider_id))
  ));
CREATE POLICY "Ambulance providers update access"
  ON public.ambulance_providers FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND (u.role::text = 'government_admin'
        OR (u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulance_providers.provider_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND (u.role::text = 'government_admin'
        OR (u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulance_providers.provider_id))
  ));

DROP POLICY IF EXISTS "Ambulances read access" ON public.ambulances;
DROP POLICY IF EXISTS "Ambulances write access" ON public.ambulances;
CREATE POLICY "Ambulances read access"
  ON public.ambulances FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND (u.role::text = 'government_admin'
        OR (u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulances.provider_id))
  ));
CREATE POLICY "Ambulances insert access"
  ON public.ambulances FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.ambulance_providers p ON p.provider_id = ambulances.provider_id AND p.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulances.provider_id
  ));
CREATE POLICY "Ambulances update access"
  ON public.ambulances FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulances.provider_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.ambulance_providers p ON p.provider_id = ambulances.provider_id AND p.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'ambulance_admin' AND u.ambulance_provider_id = ambulances.provider_id
  ));

REVOKE DELETE ON public.ambulance_providers, public.ambulances FROM PUBLIC, anon, authenticated;

COMMIT;
