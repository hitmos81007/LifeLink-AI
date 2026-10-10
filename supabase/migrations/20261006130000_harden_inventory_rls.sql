-- Remove permissive legacy policies before creating the scoped policies below.
-- PostgreSQL combines permissive policies with OR, so leaving an older USING (true)
-- policy in place would bypass these role checks.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('general_bed_inventory', 'oxygen_inventory')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE public.general_bed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oxygen_inventory ENABLE ROW LEVEL SECURITY;

-- Inventory is visible to hospital staff for their own facility, approvers for
-- their hospital's review, and government coordinators for district oversight.
CREATE POLICY "general_bed_inventory_read_scoped"
  ON public.general_bed_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND (
          user_profile.role = 'government_admin'
          OR (
            user_profile.role IN ('hospital_admin', 'hospital_approver')
            AND user_profile.hospital_id = general_bed_inventory.hospital_id
          )
        )
    )
  );

-- Only staff assigned to this hospital may create or edit its inventory.
CREATE POLICY "general_bed_inventory_insert_own_hospital"
  ON public.general_bed_inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = general_bed_inventory.hospital_id
    )
  );

CREATE POLICY "general_bed_inventory_update_own_hospital"
  ON public.general_bed_inventory
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = general_bed_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = general_bed_inventory.hospital_id
    )
  );

CREATE POLICY "oxygen_inventory_read_scoped"
  ON public.oxygen_inventory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND (
          user_profile.role = 'government_admin'
          OR (
            user_profile.role IN ('hospital_admin', 'hospital_approver')
            AND user_profile.hospital_id = oxygen_inventory.hospital_id
          )
        )
    )
  );

CREATE POLICY "oxygen_inventory_insert_own_hospital"
  ON public.oxygen_inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = oxygen_inventory.hospital_id
    )
  );

CREATE POLICY "oxygen_inventory_update_own_hospital"
  ON public.oxygen_inventory
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = oxygen_inventory.hospital_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS user_profile
      WHERE user_profile.user_id = auth.uid()
        AND user_profile.role = 'hospital_admin'
        AND user_profile.hospital_id = oxygen_inventory.hospital_id
    )
  );
