BEGIN;

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS activecase uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'game_rooms'
      AND column_name = 'code'
  ) THEN
    EXECUTE 'UPDATE game_rooms SET room_code = code WHERE (room_code IS NULL OR room_code = '''') AND code IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'game_rooms'
      AND column_name = 'active_case_id'
  ) THEN
    EXECUTE 'UPDATE game_rooms SET activecase = active_case_id WHERE activecase IS NULL';
  END IF;
END $$;

DROP INDEX IF EXISTS game_rooms_code_key;
ALTER TABLE game_rooms DROP COLUMN IF EXISTS code;
ALTER TABLE game_rooms DROP COLUMN IF EXISTS active_case_id;
ALTER TABLE game_rooms ALTER COLUMN room_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS game_rooms_room_code_key
  ON game_rooms (room_code);

COMMIT;
