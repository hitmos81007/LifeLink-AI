-- Platform administration is separate from district coordination and clinical review.
-- Keep this enum change isolated so following migrations can safely use the new value.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'platform_admin';
