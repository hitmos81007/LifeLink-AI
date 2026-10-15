-- Route medicine creates and edits through an authorised, audited transaction.
-- Transfer-held reserved_stock remains owned by the transfer workflow.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_medicine_inventory(
  p_hospital_id UUID,
  p_medicine_name TEXT,
  p_category TEXT,
  p_dosage TEXT,
  p_manufacturer TEXT,
  p_current_stock INTEGER,
  p_minimum_stock INTEGER,
  p_unit TEXT,
  p_expiry_date DATE,
  p_medicine_inventory_id UUID DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS public.medicine_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users;
  v_hospital_id UUID;
  v_row public.medicine_inventory;
  v_old JSONB;
  v_category public.medicine_category;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_user.status IS NOT TRUE OR v_user.account_status <> 'active'
     OR v_user.role::text <> 'hospital_admin' OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'Active hospital administrator account required';
  END IF;
  IF p_hospital_id IS NOT NULL AND p_hospital_id <> v_user.hospital_id THEN
    RAISE EXCEPTION 'Medicine inventory may only be changed for the assigned hospital';
  END IF;
  v_hospital_id := v_user.hospital_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.hospitals h
    WHERE h.hospital_id = v_hospital_id AND h.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'Assigned hospital is not active';
  END IF;
  IF p_medicine_name IS NULL OR length(btrim(p_medicine_name)) NOT BETWEEN 1 AND 120
     OR p_category IS NULL OR length(btrim(p_category)) = 0
     OR p_dosage IS NULL OR length(btrim(p_dosage)) NOT BETWEEN 1 AND 120
     OR p_current_stock IS NULL OR p_current_stock < 0
     OR p_minimum_stock IS NULL OR p_minimum_stock < 0
     OR p_unit IS NULL OR length(btrim(p_unit)) NOT BETWEEN 1 AND 40
     OR (p_manufacturer IS NOT NULL AND length(btrim(p_manufacturer)) > 120) THEN
    RAISE EXCEPTION 'Medicine details are invalid; stock values must be non-negative whole numbers';
  END IF;
  BEGIN
    v_category := btrim(p_category)::public.medicine_category;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Medicine category is not supported';
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_hospital_id::text || ':' || lower(btrim(p_medicine_name)) || ':' || v_category::text || ':' ||
    lower(btrim(p_dosage)) || ':' || lower(COALESCE(NULLIF(btrim(p_manufacturer), ''), '')) || ':' ||
    lower(btrim(p_unit)) || ':' || COALESCE(p_expiry_date::text, ''), 0
  ));

  IF p_medicine_inventory_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Refresh medicine inventory before creating a record' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.medicine_inventory m
      WHERE m.hospital_id = v_hospital_id
        AND m.medicine_name = btrim(p_medicine_name)
        AND m.category = v_category
        AND m.dosage = btrim(p_dosage)
        AND m.manufacturer IS NOT DISTINCT FROM NULLIF(btrim(p_manufacturer), '')
        AND m.unit = btrim(p_unit)
        AND m.expiry_date IS NOT DISTINCT FROM p_expiry_date
    ) THEN
      RAISE EXCEPTION 'This exact medicine inventory identity already exists; edit its existing row';
    END IF;
    INSERT INTO public.medicine_inventory (
      hospital_id, medicine_name, category, dosage, manufacturer, current_stock,
      reserved_stock, minimum_stock, unit, expiry_date, created_at, updated_at
    ) VALUES (
      v_hospital_id, btrim(p_medicine_name), v_category, btrim(p_dosage),
      NULLIF(btrim(p_manufacturer), ''), p_current_stock, 0, p_minimum_stock,
      btrim(p_unit), p_expiry_date, now(), now()
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.medicine_inventory
    WHERE medicine_inventory_id = p_medicine_inventory_id FOR UPDATE;
    IF NOT FOUND OR v_row.hospital_id <> v_hospital_id THEN
      RAISE EXCEPTION 'Medicine inventory record was not found for the assigned hospital';
    END IF;
    IF p_expected_updated_at IS NULL OR p_expected_updated_at IS DISTINCT FROM v_row.updated_at THEN
      RAISE EXCEPTION 'Medicine inventory changed; refresh and retry' USING ERRCODE = '40001';
    END IF;

    IF ROW(btrim(p_medicine_name), v_category, btrim(p_dosage), NULLIF(btrim(p_manufacturer), ''), btrim(p_unit), p_expiry_date)
       IS DISTINCT FROM
       ROW(v_row.medicine_name, v_row.category, v_row.dosage, v_row.manufacturer, v_row.unit, v_row.expiry_date)
       AND EXISTS (
         SELECT 1 FROM public.medicine_inventory m
         WHERE m.hospital_id = v_hospital_id
           AND m.medicine_inventory_id <> p_medicine_inventory_id
           AND m.medicine_name = btrim(p_medicine_name)
           AND m.category = v_category
           AND m.dosage = btrim(p_dosage)
           AND m.manufacturer IS NOT DISTINCT FROM NULLIF(btrim(p_manufacturer), '')
           AND m.unit = btrim(p_unit)
           AND m.expiry_date IS NOT DISTINCT FROM p_expiry_date
       ) THEN
      RAISE EXCEPTION 'Another medicine row already has this exact inventory identity';
    END IF;

    v_old := to_jsonb(v_row);
    UPDATE public.medicine_inventory
    SET medicine_name = btrim(p_medicine_name),
        category = v_category,
        dosage = btrim(p_dosage),
        manufacturer = NULLIF(btrim(p_manufacturer), ''),
        current_stock = p_current_stock,
        minimum_stock = p_minimum_stock,
        unit = btrim(p_unit),
        expiry_date = p_expiry_date,
        updated_at = now()
    WHERE medicine_inventory_id = p_medicine_inventory_id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_value, new_value, created_at)
  VALUES (
    v_user.user_id,
    CASE WHEN v_old IS NULL THEN 'MEDICINE_INVENTORY_CREATED' ELSE 'MEDICINE_INVENTORY_UPDATED' END,
    'medicine_inventory', v_row.medicine_inventory_id, v_old, to_jsonb(v_row), now()
  );
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_medicine_inventory(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, DATE, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_medicine_inventory(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, DATE, UUID, TIMESTAMPTZ) TO authenticated;

-- These legacy UPDATE triggers reference medicine-only columns that do not exist.
-- Dedicated medicine validation, notifications, risk capture, and transfer identity
-- triggers remain enabled.
DROP TRIGGER IF EXISTS trg_medicine_inventory_check ON public.medicine_inventory;
DROP TRIGGER IF EXISTS trg_medicine_low_stock ON public.medicine_inventory;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.medicine_inventory FROM PUBLIC, anon, authenticated;
REVOKE INSERT (hospital_id, medicine_name, category, dosage, manufacturer, current_stock, minimum_stock, unit, expiry_date, created_at, updated_at)
  ON public.medicine_inventory FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (medicine_name, category, dosage, manufacturer, current_stock, minimum_stock, unit, expiry_date, updated_at)
  ON public.medicine_inventory FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
