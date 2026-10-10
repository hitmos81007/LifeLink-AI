-- Do not let product metadata drift while an open transfer refers to this
-- inventory record. Stock and minimum updates remain available to the owner.
CREATE OR REPLACE FUNCTION public.guard_medicine_transfer_identity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF ROW(NEW.medicine_name,NEW.category,NEW.dosage,NEW.manufacturer,NEW.unit,NEW.expiry_date)
       IS DISTINCT FROM
     ROW(OLD.medicine_name,OLD.category,OLD.dosage,OLD.manufacturer,OLD.unit,OLD.expiry_date)
     AND EXISTS (
       SELECT 1 FROM public.resource_transfers t
       WHERE (t.source_inventory_id=OLD.medicine_inventory_id OR t.destination_inventory_id=OLD.medicine_inventory_id)
         AND t.resource_type='Medicine'
         AND t.status IN ('Pending','Approved','In Transit')
     ) THEN
    RAISE EXCEPTION 'Medicine identity cannot change while an open resource transfer refers to this inventory record';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_medicine_transfer_identity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS medicine_transfer_identity_guard ON public.medicine_inventory;
CREATE TRIGGER medicine_transfer_identity_guard
  BEFORE UPDATE OF medicine_name,category,dosage,manufacturer,unit,expiry_date
  ON public.medicine_inventory
  FOR EACH ROW EXECUTE FUNCTION public.guard_medicine_transfer_identity();
