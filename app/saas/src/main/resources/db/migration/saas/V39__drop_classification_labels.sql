-- Classification labels are now a fixed, built-in set bundled with the app and sent to the engine
-- per request (see ClassificationLabelProvider); the per-team classification_labels table (created
-- in V30) is no longer read or written. Drop it.
--
-- Forward migration: V30 is kept so any DB that already applied it still validates. This runs after
-- V30 in every case, so it drops the table whether V30 just created it (fresh DB) or it was created
-- and populated on an earlier deploy. IF EXISTS only guards the edge case where the table is already
-- absent, keeping the migration safe to apply regardless of prior state.

DROP TABLE IF EXISTS classification_labels;
