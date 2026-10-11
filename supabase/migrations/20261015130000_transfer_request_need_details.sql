-- Record logistics context for inbound hospital resource requests. These
-- fields are requester-provided operational metadata, not clinical triage.
BEGIN;

ALTER TABLE public.resource_transfers
  ADD COLUMN IF NOT EXISTS needed_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS urgency TEXT,
  ADD COLUMN IF NOT EXISTS reason_category TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.resource_transfers'::regclass AND conname='resource_transfers_urgency_check') THEN
    ALTER TABLE public.resource_transfers
      ADD CONSTRAINT resource_transfers_urgency_check
      CHECK (urgency IS NULL OR urgency IN ('Routine','Urgent','Critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.resource_transfers'::regclass AND conname='resource_transfers_reason_category_check') THEN
    ALTER TABLE public.resource_transfers
      ADD CONSTRAINT resource_transfers_reason_category_check
      CHECK (reason_category IS NULL OR reason_category IN ('Stock depletion','Demand surge','Supply disruption','Equipment failure','Other'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_inbound_resource_transfer_with_details(
  p_source_hospital_id UUID,
  p_resource_type TEXT,
  p_resource_name TEXT,
  p_quantity INTEGER,
  p_resource_identity JSONB,
  p_idempotency_key UUID,
  p_needed_by TIMESTAMPTZ,
  p_urgency TEXT,
  p_reason_category TEXT
) RETURNS public.resource_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user public.users;
  v_transfer public.resource_transfers;
  v_existing public.resource_transfers;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE user_id=auth.uid();
  IF NOT FOUND OR v_user.role::text<>'hospital_admin' OR v_user.status IS DISTINCT FROM true OR v_user.hospital_id IS NULL THEN
    RAISE EXCEPTION 'An active receiving-hospital administrator account is required';
  END IF;
  IF p_needed_by IS NULL OR p_needed_by<=now() THEN
    RAISE EXCEPTION 'Choose a need-by time in the future';
  END IF;
  IF p_urgency IS NULL OR p_urgency NOT IN ('Routine','Urgent','Critical') THEN
    RAISE EXCEPTION 'Choose a valid logistics urgency';
  END IF;
  IF p_reason_category IS NULL OR p_reason_category NOT IN ('Stock depletion','Demand surge','Supply disruption','Equipment failure','Other') THEN
    RAISE EXCEPTION 'Choose a valid reason category';
  END IF;

  SELECT * INTO v_transfer FROM public.request_inbound_resource_transfer(
    p_source_hospital_id,p_resource_type,p_resource_name,p_quantity,p_resource_identity,p_idempotency_key
  );
  SELECT * INTO v_existing FROM public.resource_transfers WHERE transfer_id=v_transfer.transfer_id FOR UPDATE;
  IF (v_existing.needed_by IS NOT NULL AND v_existing.needed_by IS DISTINCT FROM p_needed_by)
     OR (v_existing.urgency IS NOT NULL AND v_existing.urgency IS DISTINCT FROM p_urgency)
     OR (v_existing.reason_category IS NOT NULL AND v_existing.reason_category IS DISTINCT FROM p_reason_category) THEN
    RAISE EXCEPTION 'Idempotency key has already been used for different transfer request details';
  END IF;

  UPDATE public.resource_transfers
    SET needed_by=p_needed_by, urgency=p_urgency, reason_category=p_reason_category
    WHERE transfer_id=v_transfer.transfer_id
    RETURNING * INTO v_transfer;
  RETURN v_transfer;
END;
$$;

REVOKE ALL ON FUNCTION public.request_inbound_resource_transfer_with_details(UUID,TEXT,TEXT,INTEGER,JSONB,UUID,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_inbound_resource_transfer_with_details(UUID,TEXT,TEXT,INTEGER,JSONB,UUID,TIMESTAMPTZ,TEXT,TEXT) TO authenticated;

COMMENT ON COLUMN public.resource_transfers.needed_by IS 'Requester-provided logistics deadline; nullable only for historical requests.';
COMMENT ON COLUMN public.resource_transfers.urgency IS 'Requester-estimated logistics urgency; not a clinical triage decision.';
COMMENT ON COLUMN public.resource_transfers.reason_category IS 'Controlled category explaining the synthetic inter-facility resource request.';

COMMIT;
