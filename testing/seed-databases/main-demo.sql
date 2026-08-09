-- Seed data for the main-branch demo deployment: the teams and saved policies
-- that make the demo look like a real tenant.
--
-- Deliberately contains NO users. Accounts are provisioned after the container
-- boots, by scripts/deploy/provision-demo-users.sh, because their passwords
-- come from repository secrets and must never live in a public repo. See
-- pr-preview.sql for the full explanation and for what the generator's first
-- boot has already created.

------------------------------------------------------------------ teams ----
-- The user manifest (main-demo-users.json) refers to these teams by name, so
-- renaming one here means renaming it there too.
INSERT INTO teams (team_id, name) VALUES
  (100, 'Engineering'),
  (101, 'Finance'),
  (102, 'Legal'),
  (103, 'Marketing'),
  (104, 'Operations'),
  (105, 'Support');

--------------------------------------------------------------- policies ----
-- policy_json is the serialised Policy record; the columns beside it are
-- denormalised copies the store uses for listing and ordering, so the two
-- must agree. Every step's `operation` is a real Stirling endpoint path.
-- Inputs are empty: these are on-demand policies, runnable from the UI
-- without a configured source connection.
--
-- GET /api/v1/policies is team-scoped, so the first two live in team 1
-- (Default), where the bootstrap admin lands - otherwise a demo admin logs in
-- to an empty policy list. The rest are spread across the demo teams so team
-- scoping is visible by logging in as the relevant team lead.
--
-- `owner` is a plain string, not a foreign key, so naming users who do not
-- exist until provisioning runs is fine.
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

--------------------------------------------------- clear the placeholders ----
-- See pr-preview.sql: shipping the generator's `admin`/`stirling` row would
-- make hasUsers() true and stop the container taking its admin credentials
-- from SECURITY_INITIALLOGIN_*. Child rows go first: both carry a FK to users.
DELETE FROM user_settings;
DELETE FROM team_memberships;
DELETE FROM authorities;
DELETE FROM users;

------------------------------------------------- hand back the sequences ----
ALTER TABLE teams            ALTER COLUMN team_id       RESTART WITH 200;
ALTER TABLE users            ALTER COLUMN user_id       RESTART WITH 200;
ALTER TABLE authorities      ALTER COLUMN id            RESTART WITH 200;
ALTER TABLE team_memberships ALTER COLUMN membership_id RESTART WITH 200;
