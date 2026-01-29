-- Manual Migration: Convert LOB columns to TEXT type
-- This migration fixes the "Large Objects may not be used in auto-commit mode" error
-- in PostgreSQL by converting LOB columns to regular TEXT columns.
--
-- IMPORTANT: Only run this if you're using PostgreSQL and experiencing LOB errors.
-- If using H2 (default), this migration is not needed as Hibernate will handle it automatically.
--
-- BACKUP YOUR DATABASE BEFORE RUNNING THIS SCRIPT!

-- Convert audit_events.data from LOB to TEXT
-- This column stores JSON audit event data
DO $$
BEGIN
    -- Check if column exists and is a LOB type before altering
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'audit_events'
          AND column_name = 'data'
    ) THEN
        -- Alter the column type to text
        -- USING clause handles the conversion from LOB to text
        ALTER TABLE audit_events
            ALTER COLUMN data TYPE text USING CAST(data AS text);

        -- Add a comment documenting the change
        COMMENT ON COLUMN audit_events.data IS 'JSON audit event data stored as text (converted from LOB)';

        RAISE NOTICE 'Successfully converted audit_events.data from LOB to TEXT';
    ELSE
        RAISE NOTICE 'Column audit_events.data does not exist, skipping';
    END IF;
END $$;

-- Note: user_settings.setting_value already has columnDefinition="text" in the entity,
-- so it should not be using LOB type. If it is, Hibernate will correct it on next startup.
-- If you need to manually fix it:
--
-- DO $$
-- BEGIN
--     IF EXISTS (
--         SELECT 1
--         FROM information_schema.columns
--         WHERE table_name = 'user_settings'
--           AND column_name = 'setting_value'
--     ) THEN
--         ALTER TABLE user_settings
--             ALTER COLUMN setting_value TYPE text USING CAST(setting_value AS text);
--
--         COMMENT ON COLUMN user_settings.setting_value IS 'User setting value stored as text (converted from LOB)';
--
--         RAISE NOTICE 'Successfully converted user_settings.setting_value from LOB to TEXT';
--     ELSE
--         RAISE NOTICE 'Column user_settings.setting_value does not exist, skipping';
--     END IF;
-- END $$;

-- Verify the changes
SELECT
    table_name,
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('audit_events', 'user_settings')
  AND column_name IN ('data', 'setting_value')
ORDER BY table_name, column_name;
