-- Bootstrap minimal stirling_pdf state for PAYG cucumber tests.
--
-- Runs once when the postgres-saas container is first created (loaded via
-- /docker-entrypoint-initdb.d on the official postgres image). Flyway then
-- migrates V1-V13 on backend startup, which fills in the schema; this file
-- only seeds the data rows the cucumber scenarios reference by name.
--
-- Idempotent — if the container is re-created, this whole file runs again
-- but every INSERT is guarded against duplicates.

CREATE SCHEMA IF NOT EXISTS stirling_pdf;

-- Note: the actual seed of teams / users / payg_team_extensions / wallet_policy
-- happens AFTER Flyway migrations have applied. We can't insert here because
-- the tables don't exist yet at container-init time. Instead we register a
-- helper function the backend invokes once at startup (or the cucumber
-- harness invokes via psql before running scenarios).
--
-- For "make a start", the simplest approach is to keep this file as the
-- schema bootstrap, and put the seed inserts in a separate sidecar SQL that
-- the cucumber test.sh harness pipes through psql AFTER waiting for backend
-- health. See testing/compose/payg/saas-seed.sql below.

-- Reserved for future container-init-time schema bootstrap if we ever need it.
SELECT 1;
