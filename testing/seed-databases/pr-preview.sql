-- Seed data for PR preview deployments: a handful of teams and users so a
-- reviewer can exercise team scoping, role gating and the admin user list
-- without creating anything by hand.
--
-- Applied by scripts/seed-db/build-seed-db.sh on top of a freshly booted,
-- otherwise-empty database. That boot already created:
--   users        1 = admin (ROLE_ADMIN), 2 = STIRLING-PDF-BACKEND-API-USER
--   teams        1 = Default, 2 = Internal
--   team_memberships / authorities rows for both
--   user_license_settings singleton (left untouched - its integrity signature
--   is derived from a per-database salt and rewriting it trips validation)
--
-- Explicit ids start at 100 to stay clear of the bootstrap rows; the identity
-- counters are restarted at the end so the app can keep inserting.

-- Every seeded account shares this password: demo1234
-- (BCrypt, cost 10 - generated with the app's own BCryptPasswordEncoder.)

------------------------------------------------------------------ teams ----
INSERT INTO teams (team_id, name) VALUES
  (100, 'Engineering'),
  (101, 'Finance'),
  (102, 'Legal');

------------------------------------------------------------------ users ----
-- authenticationtype 'web' matches what the app writes for form-login users.
-- role_name is left null: the effective role lives in the authorities table,
-- exactly as the bootstrap admin row is written.
INSERT INTO users (user_id, username, password, enabled, authenticationtype,
                   is_first_login, has_completed_initial_setup,
                   force_password_change, oauth_grandfathered, team_id,
                   email, created_at, updated_at) VALUES
  (100, 'eng.lead',    '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE, 'web', FALSE, TRUE, FALSE, FALSE, 100, 'eng.lead@example.com',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 'eng.dev',     '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE, 'web', FALSE, TRUE, FALSE, FALSE, 100, 'eng.dev@example.com',     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 'finance.lead','$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE, 'web', FALSE, TRUE, FALSE, FALSE, 101, 'finance.lead@example.com',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 'finance.ap',  '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE, 'web', FALSE, TRUE, FALSE, FALSE, 101, 'finance.ap@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 'legal.counsel','$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2',TRUE, 'web', FALSE, TRUE, FALSE, FALSE, 102, 'legal.counsel@example.com',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Disabled on purpose: covers the "deactivated account" rendering in the
  -- admin user list and the login-rejection path.
  (105, 'former.staff','$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', FALSE,'web', FALSE, TRUE, FALSE, FALSE, 102, 'former.staff@example.com',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

------------------------------------------------------------ authorities ----
-- A spread of roles so role-gated UI can be checked from a real account.
INSERT INTO authorities (id, authority, user_id) VALUES
  (100, 'ROLE_ADMIN',             100),
  (101, 'ROLE_USER',              101),
  (102, 'ROLE_USER',              102),
  (103, 'ROLE_WEB_ONLY_USER',     103),
  (104, 'ROLE_LIMITED_API_USER',  104),
  (105, 'ROLE_USER',              105);

------------------------------------------------------- team memberships ----
INSERT INTO team_memberships (membership_id, team_id, user_id, role,
                              invited_at, accepted_at, created_at, updated_at) VALUES
  (100, 100, 100, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 100, 101, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 101, 102, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 101, 103, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 102, 104, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Invited but never accepted: exercises the pending-membership state.
  (105, 102, 105, 'MEMBER', CURRENT_TIMESTAMP, NULL,              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

------------------------------------------------- hand back the sequences ----
-- Without this the identity counters still sit at 33 and the first user or
-- team created through the UI collides with a seeded primary key.
ALTER TABLE teams            ALTER COLUMN team_id       RESTART WITH 200;
ALTER TABLE users            ALTER COLUMN user_id       RESTART WITH 200;
ALTER TABLE authorities      ALTER COLUMN id            RESTART WITH 200;
ALTER TABLE team_memberships ALTER COLUMN membership_id RESTART WITH 200;
