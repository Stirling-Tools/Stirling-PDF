-- Teams and users for PR preview deployments. Applied by
-- scripts/seed-db/build-seed-db.sh on top of a freshly booted database.
--
-- Only bcrypt hashes are committed; the demo-account plaintext is a 32-char
-- random string held outside the repo. Rotate by re-hashing and rebuilding.
-- Seeding users means SECURITY_INITIALLOGIN_* is ignored: the app only
-- bootstraps an admin when the user table is empty.

INSERT INTO teams (team_id, name) VALUES
  (100, 'Engineering'),
  (101, 'Finance'),
  (102, 'Legal');

-- Reset the bootstrap admin to the seeded credentials rather than leaving the
-- generator's well-known admin/stirling in place.
UPDATE users
   SET password = '$2a$10$yUh3LFp9Vp6Av5jkYm/L.uQZlkd61zUIJ6oARXIl9crydZjtHWSWa',
       is_first_login = FALSE,
       has_completed_initial_setup = TRUE
 WHERE username = 'admin';

-- role_name stays null: the effective role lives in authorities, matching how
-- the app writes the bootstrap admin.
INSERT INTO users (user_id, username, password, enabled, authenticationtype,
                   is_first_login, has_completed_initial_setup,
                   force_password_change, oauth_grandfathered, team_id,
                   email, created_at, updated_at) VALUES
  (100, 'eng.lead',      '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', TRUE,  'web', FALSE, TRUE, FALSE, FALSE, 100, 'eng.lead@example.com',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 'eng.dev',       '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', TRUE,  'web', FALSE, TRUE, FALSE, FALSE, 100, 'eng.dev@example.com',       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 'finance.lead',  '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', TRUE,  'web', FALSE, TRUE, FALSE, FALSE, 101, 'finance.lead@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 'finance.ap',    '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', TRUE,  'web', FALSE, TRUE, FALSE, FALSE, 101, 'finance.ap@example.com',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 'legal.counsel', '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', TRUE,  'web', FALSE, TRUE, FALSE, FALSE, 102, 'legal.counsel@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Disabled: covers the deactivated-account rendering and login rejection.
  (105, 'former.staff',  '$2a$10$Rw/dExUcJO5OM6Ijj09L0.MQqXzqUsWPfxO1lQne7QO.K.2ryWWai', FALSE, 'web', FALSE, TRUE, FALSE, FALSE, 102, 'former.staff@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO authorities (id, authority, user_id) VALUES
  (100, 'ROLE_ADMIN',            100),
  (101, 'ROLE_USER',             101),
  (102, 'ROLE_USER',             102),
  (103, 'ROLE_WEB_ONLY_USER',    103),
  (104, 'ROLE_LIMITED_API_USER', 104),
  (105, 'ROLE_USER',             105);

INSERT INTO team_memberships (membership_id, team_id, user_id, role,
                              invited_at, accepted_at, created_at, updated_at) VALUES
  (100, 100, 100, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 100, 101, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 101, 102, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 101, 103, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 102, 104, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Invited but never accepted: exercises the pending-membership state.
  (105, 102, 105, 'MEMBER', CURRENT_TIMESTAMP, NULL,              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Counters still sit low after bootstrap; without this the first row the app
-- inserts collides with a seeded id.
ALTER TABLE teams            ALTER COLUMN team_id       RESTART WITH 200;
ALTER TABLE users            ALTER COLUMN user_id       RESTART WITH 200;
ALTER TABLE authorities      ALTER COLUMN id            RESTART WITH 200;
ALTER TABLE team_memberships ALTER COLUMN membership_id RESTART WITH 200;
