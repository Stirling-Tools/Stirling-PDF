-- Seed data for the main-branch demo deployment. Everything the PR preview
-- seed has, plus enough breadth that the demo looks like a real tenant:
-- more teams, a wider spread of roles, saved policies and sources, and
-- per-user settings.
--
-- Applied by scripts/seed-db/build-seed-db.sh on top of a freshly booted,
-- otherwise-empty database. See pr-preview.sql for what that boot already
-- created and why user_license_settings is left alone.
--
-- Every seeded account shares this password: demo1234

------------------------------------------------------------------ teams ----
INSERT INTO teams (team_id, name) VALUES
  (100, 'Engineering'),
  (101, 'Finance'),
  (102, 'Legal'),
  (103, 'Marketing'),
  (104, 'Operations'),
  (105, 'Support');

------------------------------------------------------------------ users ----
INSERT INTO users (user_id, username, password, enabled, authenticationtype,
                   is_first_login, has_completed_initial_setup,
                   force_password_change, oauth_grandfathered, team_id,
                   email, created_at, updated_at) VALUES
  (100, 'eng.lead',      '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 100, 'eng.lead@example.com',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 'eng.dev',       '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 100, 'eng.dev@example.com',       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 'eng.qa',        '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 100, 'eng.qa@example.com',        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 'finance.lead',  '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 101, 'finance.lead@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 'finance.ap',    '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 101, 'finance.ap@example.com',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (105, 'finance.audit', '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 101, 'finance.audit@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (106, 'legal.counsel', '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 102, 'legal.counsel@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (107, 'legal.para',    '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 102, 'legal.para@example.com',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (108, 'marketing.lead','$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 103, 'marketing.lead@example.com',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (109, 'marketing.des', '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 103, 'marketing.des@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (110, 'ops.lead',      '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 104, 'ops.lead@example.com',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (111, 'ops.automation','$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 104, 'ops.automation@example.com',CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (112, 'support.lead',  '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 105, 'support.lead@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (113, 'support.agent', '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', FALSE, TRUE,  FALSE, FALSE, 105, 'support.agent@example.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Has never logged in: lands on the first-login / change-password flow.
  (114, 'new.starter',   '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', TRUE,  'web', TRUE,  FALSE, TRUE,  FALSE, 100, 'new.starter@example.com',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Disabled: covers the deactivated-account rendering and login rejection.
  (115, 'former.staff',  '$2a$10$4NdQQKTLQ4BDf3paaCb52eoAQ7azEdbfNtvSS4W61BmFIIF0iu4d2', FALSE, 'web', FALSE, TRUE,  FALSE, FALSE, 102, 'former.staff@example.com',  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

------------------------------------------------------------ authorities ----
INSERT INTO authorities (id, authority, user_id) VALUES
  (100, 'ROLE_ADMIN',                 100),
  (101, 'ROLE_USER',                  101),
  (102, 'ROLE_USER',                  102),
  (103, 'ROLE_ADMIN',                 103),
  (104, 'ROLE_WEB_ONLY_USER',         104),
  (105, 'ROLE_USER',                  105),
  (106, 'ROLE_LIMITED_API_USER',      106),
  (107, 'ROLE_WEB_ONLY_USER',         107),
  (108, 'ROLE_USER',                  108),
  (109, 'ROLE_USER',                  109),
  (110, 'ROLE_ADMIN',                 110),
  (111, 'ROLE_LIMITED_API_USER',      111),
  (112, 'ROLE_USER',                  112),
  (113, 'ROLE_EXTRA_LIMITED_API_USER',113),
  (114, 'ROLE_USER',                  114),
  (115, 'ROLE_USER',                  115);

------------------------------------------------------- team memberships ----
INSERT INTO team_memberships (membership_id, team_id, user_id, role,
                              invited_at, accepted_at, created_at, updated_at) VALUES
  (100, 100, 100, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (101, 100, 101, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (102, 100, 102, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (103, 101, 103, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (104, 101, 104, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (105, 101, 105, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (106, 102, 106, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (107, 102, 107, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (108, 103, 108, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (109, 103, 109, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (110, 104, 110, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (111, 104, 111, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (112, 105, 112, 'LEADER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (113, 105, 113, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (114, 100, 114, 'MEMBER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  -- Invited but never accepted: exercises the pending-membership state.
  (115, 102, 115, 'MEMBER', CURRENT_TIMESTAMP, NULL,              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

--------------------------------------------------------------- policies ----
-- policy_json is the serialised Policy record; the columns beside it are
-- denormalised copies the store uses for listing and ordering, so the two
-- must agree. Every step's `operation` is a real Stirling endpoint path.
-- Inputs are empty: these are on-demand policies, runnable from the UI
-- without a configured source connection.
--
-- GET /api/v1/policies is team-scoped, so the first two live in team 1
-- (Default) where the bootstrap `admin` account sits - otherwise a demo admin
-- logs in to an empty policy list. The rest are spread across the demo teams
-- so team scoping is visible by logging in as the relevant team lead.
INSERT INTO policies (id, name, owner, enabled, team_id, sort_order, policy_json) VALUES
  ('demo-shrink-and-clean', 'Shrink and clean up', 'admin', TRUE, 1, 1,
   '{"id":"demo-shrink-and-clean","name":"Shrink and clean up","owner":"admin","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/misc/compress-pdf","parameters":{"optimizeLevel":3},"fileParameters":{}},{"operation":"/api/v1/misc/sanitize-pdf","parameters":{"removeJavaScript":true,"removeEmbeddedFiles":true},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":1}'),

  ('demo-watermark-draft', 'Watermark as draft', 'admin', TRUE, 1, 2,
   '{"id":"demo-watermark-draft","name":"Watermark as draft","owner":"admin","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/security/add-watermark","parameters":{"watermarkType":"text","watermarkText":"DRAFT","fontSize":40,"rotation":45,"opacity":0.3,"widthSpacer":50,"heightSpacer":50},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":1}'),

  ('demo-compress-archive', 'Compress for archive', 'eng.lead', TRUE, 100, 3,
   '{"id":"demo-compress-archive","name":"Compress for archive","owner":"eng.lead","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/misc/compress-pdf","parameters":{"optimizeLevel":4},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":100}'),

  ('demo-invoice-flatten', 'Flatten and stamp invoices', 'finance.lead', TRUE, 101, 4,
   '{"id":"demo-invoice-flatten","name":"Flatten and stamp invoices","owner":"finance.lead","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/misc/flatten","parameters":{"flattenOnlyForms":false},"fileParameters":{}},{"operation":"/api/v1/misc/add-stamp","parameters":{"stampType":"text","stampText":"PAID","fontSize":30,"rotation":45,"opacity":0.4,"position":5},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":101}'),

  ('demo-contract-redact', 'Redact and protect contracts', 'legal.counsel', TRUE, 102, 5,
   '{"id":"demo-contract-redact","name":"Redact and protect contracts","owner":"legal.counsel","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/security/auto-redact","parameters":{"listOfText":"Confidential\nInternal Only","useRegex":false,"wholeWordSearch":false,"convertPDFToImage":true},"fileParameters":{}},{"operation":"/api/v1/security/add-password","parameters":{"ownerPassword":"demo-owner","preventPrinting":true},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":102}'),

  ('demo-brochure-merge', 'Merge brochure pages', 'marketing.lead', TRUE, 103, 6,
   '{"id":"demo-brochure-merge","name":"Merge brochure pages","owner":"marketing.lead","enabled":true,"inputs":[],"steps":[{"operation":"/api/v1/general/merge-pdfs","parameters":{"sortType":"orderProvided"},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":103}'),

  -- Deliberately disabled so the policy list shows both states.
  ('demo-ocr-scans', 'OCR scanned intake', 'ops.lead', FALSE, 104, 7,
   '{"id":"demo-ocr-scans","name":"OCR scanned intake","owner":"ops.lead","enabled":false,"inputs":[],"steps":[{"operation":"/api/v1/misc/ocr-pdf","parameters":{"languages":["eng"],"ocrType":"skip-text"},"fileParameters":{}}],"output":{"type":"inline","options":{}},"outputIds":[],"teamId":104}');

------------------------------------------------------------ user settings ----
-- Element-collection rows keyed (user_id, setting_key).
INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES
  (100, 'language',   'en-GB'),
  (100, 'theme',      'dark'),
  (103, 'language',   'en-US'),
  (103, 'theme',      'light'),
  (106, 'language',   'de-DE'),
  (108, 'theme',      'dark');

------------------------------------------------- hand back the sequences ----
ALTER TABLE teams            ALTER COLUMN team_id       RESTART WITH 200;
ALTER TABLE users            ALTER COLUMN user_id       RESTART WITH 200;
ALTER TABLE authorities      ALTER COLUMN id            RESTART WITH 200;
ALTER TABLE team_memberships ALTER COLUMN membership_id RESTART WITH 200;
