-- Preserve medicine inventory rows referenced by transfers. Hospital admins
-- may add and correct stock at their own active hospital, but cannot delete.
BEGIN;

DROP POLICY IF EXISTS "medicine_inventory_write_active_own_hospital" ON public.medicine_inventory;

CREATE POLICY "medicine_inventory_insert_active_own_hospital"
  ON public.medicine_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = medicine_inventory.hospital_id
  ));

CREATE POLICY "medicine_inventory_update_active_own_hospital"
  ON public.medicine_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = medicine_inventory.hospital_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.hospitals h ON h.hospital_id = u.hospital_id AND h.status = 'Active'
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'hospital_admin'
      AND u.hospital_id = medicine_inventory.hospital_id
  ));

REVOKE DELETE ON public.medicine_inventory FROM PUBLIC, anon, authenticated;

COMMIT;
