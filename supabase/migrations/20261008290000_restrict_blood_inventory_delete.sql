-- Preserve blood-group inventory rows as the durable stock record. Bank
-- administrators can add or correct their own stock, but cannot delete rows.
BEGIN;

DROP POLICY IF EXISTS "blood_inventory_write_active_own_bank" ON public.blood_inventory;

CREATE POLICY "blood_inventory_insert_active_own_bank"
  ON public.blood_inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'blood_bank_admin'
      AND b.status = 'Active'
      AND u.blood_bank_id = blood_inventory.blood_bank_id
  ));

CREATE POLICY "blood_inventory_update_active_own_bank"
  ON public.blood_inventory FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'blood_bank_admin'
      AND b.status = 'Active'
      AND u.blood_bank_id = blood_inventory.blood_bank_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.blood_banks b ON b.blood_bank_id = u.blood_bank_id
    WHERE u.user_id = auth.uid() AND u.status IS TRUE
      AND u.role::text = 'blood_bank_admin'
      AND b.status = 'Active'
      AND u.blood_bank_id = blood_inventory.blood_bank_id
  ));

REVOKE DELETE ON public.blood_inventory FROM PUBLIC, anon, authenticated;

COMMIT;
