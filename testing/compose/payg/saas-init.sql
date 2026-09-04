-- Container-init bootstrap for the PAYG cucumber postgres.
--
-- Runs once when the postgres-saas container is first created (loaded via
-- /docker-entrypoint-initdb.d on the official postgres image), before the
-- backend has connected. Only the schemas are created here: the tables come
-- from Hibernate ddl-auto on backend startup, and the seed rows from
-- saas-seed.sql once those tables exist (see docker-compose-saas.yml).
--
-- Hibernate creates the `stirling_pdf` namespace itself, but SupabaseUser maps
-- `auth.users` and the `auth` schema is provisioned by Supabase in a real
-- database, so it has to be created here for the entity table to land.

CREATE SCHEMA IF NOT EXISTS stirling_pdf;
CREATE SCHEMA IF NOT EXISTS auth;
