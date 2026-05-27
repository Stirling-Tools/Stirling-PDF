-- ShedLock storage table. ShedLock takes a row-level lock in this table before a @Scheduled
-- method fires so a multi-instance deploy doesn't double-run the job. The columns are exactly
-- those required by net.javacrumbs.shedlock:shedlock-provider-jdbc-template (6.x):
--   name        — the lock identifier, supplied via @SchedulerLock(name = ...).
--   lock_until  — when the lock expires (renewed during the job; bounded by lockAtMostFor).
--   locked_at   — when the lock was acquired (for diagnostics).
--   locked_by   — hostname of the instance that holds the lock (also diagnostics).
--
-- The default_schema property already places this under stirling_pdf, alongside the other SaaS
-- tables. No application code needs to touch this table — ShedLock manages it.

CREATE TABLE IF NOT EXISTS shedlock (
    name        VARCHAR(64)  NOT NULL,
    lock_until  TIMESTAMP    NOT NULL,
    locked_at   TIMESTAMP    NOT NULL,
    locked_by   VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
