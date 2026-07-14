-- Classification labels are now a fixed, built-in set bundled with the app and sent to the engine
-- per request (see ClassificationLabelProvider); the per-team classification_labels table (created
-- in V30) is no longer read or written. Drop it.
--
-- Forward/idempotent by design: V30 is kept so any DB that already applied it still validates, and
-- IF EXISTS makes this a no-op on a fresh DB where V30 just created the (empty) table. Safe whether
-- or not the table was ever populated or even applied.

DROP TABLE IF EXISTS classification_labels;
