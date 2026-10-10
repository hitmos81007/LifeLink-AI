-- Scope medicine inventory reads and writes to active accounts. The existing
-- column grants continue to protect transfer-held reserved_stock.
DROP POLICY IF EXISTS "Medicine inventory read access" ON public.medicine_inventory;
DROP POLICY IF EXISTS "Medicine inventory write access" ON public.medicine_inventory;

CREATE POLICY "medicine_inventory_read_active_scoped"
  ON public.medicine_inventory
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND (u.role='government_admin' OR (u.role IN ('hospital_admin','hospital_approver') AND u.hospital_id=medicine_inventory.hospital_id))
  ));

CREATE POLICY "medicine_inventory_write_active_own_hospital"
  ON public.medicine_inventory
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role='hospital_admin' AND u.hospital_id=medicine_inventory.hospital_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id=auth.uid() AND u.status IS TRUE
      AND u.role='hospital_admin' AND u.hospital_id=medicine_inventory.hospital_id
  ));
