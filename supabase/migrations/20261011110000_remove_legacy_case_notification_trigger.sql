-- The legacy trigger inserts a notification without receiver_id, which aborts
-- every newly approved case. The transactional review RPC already creates the
-- patient-facing notice with an explicit recipient.
BEGIN;
DROP TRIGGER IF EXISTS trg_new_emergency_notification ON public.emergency_cases;
COMMIT;
