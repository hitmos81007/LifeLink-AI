-- Bound human-authored synthetic review notes. The review RPC already rejects
-- blank notes, email addresses, and phone numbers; this closes the length gap.
ALTER TABLE public.plan_reviews
  ADD CONSTRAINT plan_reviews_reason_length
  CHECK (reason IS NULL OR length(trim(reason)) BETWEEN 8 AND 500)
  NOT VALID;

ALTER TABLE public.plan_reviews
  VALIDATE CONSTRAINT plan_reviews_reason_length;
