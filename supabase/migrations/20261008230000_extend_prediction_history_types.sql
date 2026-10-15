-- These labels let prediction_history represent bed demand and the honest
-- synthetic-rate method. This migration is separate so enum labels commit before use.
ALTER TYPE public.transfer_resource_type ADD VALUE IF NOT EXISTS 'ICU Beds';
ALTER TYPE public.transfer_resource_type ADD VALUE IF NOT EXISTS 'General Beds';
ALTER TYPE public.prediction_model ADD VALUE IF NOT EXISTS 'SyntheticRequestRate';
