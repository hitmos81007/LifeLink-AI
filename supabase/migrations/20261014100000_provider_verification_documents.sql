-- Private proof documents for hospital, blood-bank, and ambulance provider review.
-- Provider accounts cannot become active until a platform administrator verifies a document.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('provider-verification-documents', 'provider-verification-documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

CREATE TABLE IF NOT EXISTS public.provider_verification_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('hospital', 'blood_bank', 'ambulance')),
  document_type TEXT NOT NULL CHECK (length(btrim(document_type)) BETWEEN 2 AND 120),
  object_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  review_reason TEXT,
  reviewed_by UUID REFERENCES public.users(user_id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_verification_documents_owner_path CHECK (split_part(object_path, '/', 1) = user_id::text)
);

CREATE INDEX IF NOT EXISTS provider_verification_documents_user_created_idx
  ON public.provider_verification_documents(user_id, created_at DESC);

ALTER TABLE public.provider_verification_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_verification_documents FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.provider_verification_documents TO authenticated;

DROP POLICY IF EXISTS provider_verification_documents_read_owner_or_admin ON public.provider_verification_documents;
CREATE POLICY provider_verification_documents_read_owner_or_admin
ON public.provider_verification_documents FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users admin
    WHERE admin.user_id = auth.uid() AND admin.role::text = 'platform_admin'
      AND admin.status IS TRUE AND admin.account_status::text = 'active'
  )
);

DROP POLICY IF EXISTS provider_verification_documents_insert_pending_owner ON public.provider_verification_documents;
CREATE POLICY provider_verification_documents_insert_pending_owner
ON public.provider_verification_documents FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.users provider
    WHERE provider.user_id = auth.uid() AND provider.account_status::text = 'pending'
      AND ((provider.role::text = 'hospital_admin' AND provider_kind = 'hospital')
        OR (provider.role::text = 'blood_bank_admin' AND provider_kind = 'blood_bank')
        OR (provider.role::text = 'ambulance_admin' AND provider_kind = 'ambulance'))
  )
);

-- Object names are generated UUIDs, and all objects live in the user's own folder.
DROP POLICY IF EXISTS provider_verification_objects_insert_pending_owner ON storage.objects;
CREATE POLICY provider_verification_objects_insert_pending_owner
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'provider-verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid()
              AND u.account_status::text = 'pending'
              AND u.role::text IN ('hospital_admin', 'blood_bank_admin', 'ambulance_admin'))
);

DROP POLICY IF EXISTS provider_verification_objects_read_owner_or_admin ON storage.objects;
CREATE POLICY provider_verification_objects_read_owner_or_admin
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'provider-verification-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users admin WHERE admin.user_id = auth.uid()
               AND admin.role::text = 'platform_admin' AND admin.status IS TRUE
               AND admin.account_status::text = 'active')
  )
);

DROP POLICY IF EXISTS provider_verification_objects_delete_pending_owner ON storage.objects;
CREATE POLICY provider_verification_objects_delete_pending_owner
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'provider-verification-documents'
       AND (storage.foldername(name))[1] = auth.uid()::text
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid()
                   AND u.account_status::text = 'pending'));

CREATE OR REPLACE FUNCTION public.review_provider_verification_document(
  p_document_id UUID, p_decision TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.users;
  v_document public.provider_verification_documents;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND OR v_actor.role::text <> 'platform_admin' OR v_actor.status IS DISTINCT FROM true
     OR v_actor.account_status::text <> 'active' THEN
    RAISE EXCEPTION 'Active platform administrator access is required';
  END IF;
  IF p_decision NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Unsupported document decision'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'A review reason between 3 and 500 characters is required';
  END IF;
  SELECT * INTO v_document FROM public.provider_verification_documents
    WHERE document_id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification document was not found'; END IF;
  IF v_document.status = 'verified' AND p_decision = 'rejected' THEN
    RAISE EXCEPTION 'A verified document cannot be rejected; submit a replacement for further review';
  END IF;
  UPDATE public.provider_verification_documents
    SET status = p_decision, review_reason = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
    WHERE document_id = p_document_id;
  RETURN jsonb_build_object('document_id', p_document_id, 'status', p_decision, 'reviewed_by', auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.review_provider_verification_document(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_provider_verification_document(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_verified_provider_document_before_activation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.account_status::text = 'active'
     AND OLD.account_status::text IS DISTINCT FROM 'active'
     AND NEW.role::text IN ('hospital_admin', 'blood_bank_admin', 'ambulance_admin')
     AND NOT EXISTS (
       SELECT 1 FROM public.provider_verification_documents d
       WHERE d.user_id = NEW.user_id AND d.status = 'verified'
     ) THEN
    RAISE EXCEPTION 'Provider activation requires an administrator-verified proof document';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_requires_verified_document ON public.users;
CREATE TRIGGER provider_requires_verified_document
BEFORE UPDATE OF account_status ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_provider_document_before_activation();

COMMIT;
