-- Oxygen capacity feeds clinician review and recommendations. Only active
-- accounts at active hospitals may read or maintain facility inventory.
BEGIN;

DROP POLICY IF EXISTS "oxygen_inventory_read_scoped" ON public.oxygen_inventory;
DROP POLICY IF EXISTS "oxygen_inventory_insert_own_hospital" ON public.oxygen_inventory;
DROP POLICY IF EXISTS "oxygen_inventory_update_own_hospital" ON public.oxygen_inventory;

CREATE POLICY "oxygen_inventory_read_active_scoped"
  ON public.oxygen_inventory FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND (
        u.role::text = 'government_admin'
        OR (u.role::text IN ('hospital_admin','hospital_approver') AND u.hospital_id = oxygen_inventory.hospital_id)
      )
  ));

CREATE POLICY "oxygen_inventory_insert_active_own_hospital"
  ON public.oxygen_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = oxygen_inventory.hospital_id
  ));

CREATE POLICY "oxygen_inventory_update_active_own_hospital"
  ON public.oxygen_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = oxygen_inventory.hospital_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = oxygen_inventory.hospital_id
  ));

COMMIT;
