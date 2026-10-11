-- Make blood stock edits atomic, version checked, scoped to an active bank,
-- and audited with the blood inventory row's primary key.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_blood_inventory(
  p_blood_bank_id UUID,
  p_blood_group TEXT,
  p_available_units INTEGER,
  p_reserved_units INTEGER,
  p_expired_units INTEGER,
  p_minimum_threshold INTEGER,
  p_last_restocked TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL,
  p_inventory_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NULL
) RETURNS public.blood_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_bank_id UUID;
  v_blood_group public.blood_group;
  v_row public.blood_inventory;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'blood_bank_admin' OR v_user.blood_bank_id IS NULL THEN
    RAISE EXCEPTION 'Active blood bank administrator account required';
  END IF;
  IF p_blood_bank_id IS NOT NULL AND p_blood_bank_id <> v_user.blood_bank_id THEN
    RAISE EXCEPTION 'Blood inventory may only be changed for the assigned blood bank';
  END IF;
  v_bank_id := v_user.blood_bank_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.blood_banks b
    WHERE b.blood_bank_id = v_bank_id AND b.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Assigned blood bank is not active';
  END IF;
  PERFORM set_config('lifelink.current_actor_id', v_user.user_id::text, true);
  IF p_blood_group IS NULL OR p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
     OR p_available_units IS NULL OR p_reserved_units IS NULL OR p_expired_units IS NULL
     OR p_minimum_threshold IS NULL OR p_available_units < 0 OR p_reserved_units < 0
     OR p_expired_units < 0 OR p_minimum_threshold < 0
     OR p_reserved_units + p_expired_units > p_available_units THEN
    RAISE EXCEPTION 'Blood stock must use a valid group and non-negative counts; reserved and expired units cannot exceed on-hand units';
  END IF;
  v_blood_group := p_blood_group::public.blood_group;

  -- One writer at a time for each facility/group pair, including concurrent adds.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_bank_id::text || ':' || v_blood_group::text, 0));

  IF p_inventory_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Refresh blood inventory before creating a record' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.blood_inventory bi
      WHERE bi.blood_bank_id = v_bank_id AND bi.blood_group = v_blood_group
    ) THEN
      RAISE EXCEPTION 'This blood group already has an inventory record; refresh and edit it' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.blood_inventory (
      blood_bank_id, blood_group, available_units, reserved_units, expired_units,
      minimum_threshold, last_restocked, created_at, updated_at
    ) VALUES (
      v_bank_id, v_blood_group, p_available_units, p_reserved_units, p_expired_units,
      p_minimum_threshold, COALESCE(p_last_restocked, now()), now(), now()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.blood_inventory
    WHERE inventory_id = p_inventory_id FOR UPDATE;
    IF NOT FOUND OR v_row.blood_bank_id <> v_bank_id THEN
      RAISE EXCEPTION 'Blood inventory record was not found for the assigned bank';
    END IF;
    IF v_row.blood_group <> v_blood_group THEN
      RAISE EXCEPTION 'Blood group identity cannot be changed while editing a row';
    END IF;
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
      RAISE EXCEPTION 'Blood inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;
    UPDATE public.blood_inventory
    SET available_units = p_available_units,
        reserved_units = p_reserved_units,
        expired_units = p_expired_units,
        minimum_threshold = p_minimum_threshold,
        last_restocked = COALESCE(p_last_restocked, last_restocked),
        updated_at = now()
    WHERE inventory_id = p_inventory_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_blood_inventory(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMP WITHOUT TIME ZONE, UUID, TIMESTAMP WITHOUT TIME ZONE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_blood_inventory(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TIMESTAMP WITHOUT TIME ZONE, UUID, TIMESTAMP WITHOUT TIME ZONE) TO authenticated;

-- These legacy triggers reference columns absent from blood_inventory.
DROP TRIGGER IF EXISTS trg_blood_inventory_check ON public.blood_inventory;
DROP TRIGGER IF EXISTS trg_blood_low_stock ON public.blood_inventory;

-- Keep database-side audit coverage while recording this table's actual row ID.
CREATE OR REPLACE FUNCTION public.audit_blood_inventory_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    COALESCE(NULLIF(current_setting('lifelink.current_actor_id', true), '')::UUID, auth.uid()),
    CASE WHEN TG_OP = 'INSERT' THEN 'BLOOD_INVENTORY_CREATED' ELSE 'BLOOD_INVENTORY_UPDATED' END,
    'blood_inventory', NEW.inventory_id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), now()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_blood_inventory_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_blood_inventory_audit ON public.blood_inventory;
CREATE TRIGGER trg_blood_inventory_audit
  AFTER INSERT OR UPDATE ON public.blood_inventory
  FOR EACH ROW EXECUTE FUNCTION public.audit_blood_inventory_change();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.blood_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT (blood_bank_id, blood_group, available_units, reserved_units, expired_units, minimum_threshold, last_restocked, created_at, updated_at)
  ON public.blood_inventory FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (blood_group, available_units, reserved_units, expired_units, minimum_threshold, last_restocked, updated_at)
  ON public.blood_inventory FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
