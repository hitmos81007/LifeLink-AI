-- Medicine transfers must never reserve, hand off, or receive stock after its
-- recorded expiry date. A missing expiry date retains the existing prototype
-- semantics; date-only stock remains eligible through its expiry day.
CREATE OR REPLACE FUNCTION public.guard_resource_transfer_medicine_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expiry_date DATE;
BEGIN
  IF NEW.resource_type <> 'Medicine' THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_identity IS NULL THEN
    RAISE EXCEPTION 'Medicine transfer is missing its inventory identity snapshot';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status IN ('Approved', 'In Transit') THEN
    SELECT i.expiry_date INTO v_expiry_date
    FROM public.medicine_inventory i
    WHERE i.medicine_inventory_id = NEW.source_inventory_id
      AND i.hospital_id = NEW.source_hospital_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medicine source inventory is no longer available';
    END IF;
    IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Expired medicine cannot be requested, approved, or handed off';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status = 'Completed' THEN
    SELECT i.expiry_date INTO v_expiry_date
    FROM public.medicine_inventory i
    WHERE i.medicine_inventory_id = NEW.destination_inventory_id
      AND i.hospital_id = NEW.destination_hospital_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medicine destination inventory is no longer available';
    END IF;
    IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'Expired medicine cannot be requested or received';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_resource_transfer_medicine_expiry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resource_transfer_medicine_expiry_insert_guard ON public.resource_transfers;
CREATE TRIGGER resource_transfer_medicine_expiry_insert_guard
  BEFORE INSERT ON public.resource_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_resource_transfer_medicine_expiry();

DROP TRIGGER IF EXISTS resource_transfer_medicine_expiry_status_guard ON public.resource_transfers;
CREATE TRIGGER resource_transfer_medicine_expiry_status_guard
  BEFORE UPDATE OF status ON public.resource_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_resource_transfer_medicine_expiry();
