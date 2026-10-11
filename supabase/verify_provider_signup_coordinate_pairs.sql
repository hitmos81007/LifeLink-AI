-- Regression check: invalid facility coordinate pairs must be rejected by the
-- auth.users trigger. Any rows created by a broken check are rolled back.
BEGIN;

DO $$
DECLARE
  v_case RECORD;
  v_user_id UUID;
  v_rejected BOOLEAN;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('latitude without longitude', jsonb_build_object('role', 'hospital_admin', 'latitude', '13.08'), 'both latitude and longitude'),
      ('longitude without latitude', jsonb_build_object('role', 'blood_bank_admin', 'longitude', '80.27'), 'both latitude and longitude'),
      ('latitude outside range', jsonb_build_object('role', 'hospital_admin', 'latitude', '91', 'longitude', '80'), 'outside valid geographic bounds'),
      ('longitude outside range', jsonb_build_object('role', 'blood_bank_admin', 'latitude', '13', 'longitude', '181'), 'outside valid geographic bounds'),
      ('non-numeric latitude', jsonb_build_object('role', 'hospital_admin', 'latitude', 'north', 'longitude', '80'), 'coordinates must be valid numbers')
    ) AS cases(label, metadata, expected_error)
  LOOP
    v_user_id := gen_random_uuid();
    v_rejected := FALSE;

    BEGIN
      INSERT INTO auth.users (
        id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        v_user_id, 'authenticated', 'authenticated',
        'coord-check-' || v_user_id::TEXT || '@example.invalid', '',
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        v_case.metadata, now(), now()
      );
    EXCEPTION WHEN OTHERS THEN
      IF position(v_case.expected_error IN SQLERRM) > 0 THEN
        v_rejected := TRUE;
      ELSE
        RAISE;
      END IF;
    END;

    IF NOT v_rejected THEN
      RAISE EXCEPTION 'Coordinate validation failed: case "%" was accepted.', v_case.label;
    END IF;
  END LOOP;
END;
$$;

ROLLBACK;
