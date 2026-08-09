-- Seed data for PR preview deployments: the teams a reviewer needs in order
-- to exercise team scoping without creating anything by hand.
--
-- Deliberately contains NO users. Accounts are provisioned after the container
-- boots, by scripts/deploy/provision-demo-users.sh, because their passwords
-- come from repository secrets and must never live in a public repo. Leaving
-- the users table empty also keeps `UserService.hasUsers()` false, so the app
-- still bootstraps its admin from SECURITY_INITIALLOGIN_USERNAME / _PASSWORD
-- exactly as it would on a fresh install.
--
-- Applied by scripts/seed-db/build-seed-db.sh on top of a freshly booted,
-- otherwise-empty database. That boot already created:
--   users        1 = admin, 2 = STIRLING-PDF-BACKEND-API-USER
--   teams        1 = Default, 2 = Internal
--   user_license_settings singleton (left untouched - its integrity signature
--   is derived from a per-database salt and rewriting it trips validation)

------------------------------------------------------------------ teams ----
-- Explicit ids start at 100 to stay clear of the bootstrap rows. The user
-- manifest (pr-preview-users.json) refers to these teams by name, so renaming
-- one here means renaming it there too.
INSERT INTO teams (team_id, name) VALUES
  (100, 'Engineering'),
  (101, 'Finance'),
  (102, 'Legal');

--------------------------------------------------- clear the placeholders ----
-- The generator's boot left an `admin`/`stirling` row behind. Ship that and
-- `hasUsers()` would be true, so the deployment would silently keep the
-- well-known password instead of taking SECURITY_INITIALLOGIN_* from secrets.
-- Wipe the user tables so the container bootstraps its own admin.
-- Child rows go first: both carry a FK to users.
DELETE FROM user_settings;
DELETE FROM team_memberships;
DELETE FROM authorities;
DELETE FROM users;

------------------------------------------------- hand back the sequences ----
-- Without this the identity counters still sit low and the first team or user
-- created through the UI collides with a seeded primary key.
ALTER TABLE teams            ALTER COLUMN team_id       RESTART WITH 200;
ALTER TABLE users            ALTER COLUMN user_id       RESTART WITH 200;
ALTER TABLE authorities      ALTER COLUMN id            RESTART WITH 200;
ALTER TABLE team_memberships ALTER COLUMN membership_id RESTART WITH 200;
