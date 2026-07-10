-- Seats are unlimited under the PAYG model. Flip the column defaults so newly created
-- team-extension rows are uncapped (0 = unlimited, which the frontend already reads as
-- "no limit"). The old default of 1 made every fresh row look like a 1-seat team.
--
-- Structural change only. Backfilling existing rows (max_seats/seat_count -> 0 and repairing
-- mis-flagged personal teams) is done as a one-off data migration run by hand against the
-- target Supabase, not checked in here.

ALTER TABLE saas_team_extensions ALTER COLUMN max_seats  SET DEFAULT 0;
ALTER TABLE saas_team_extensions ALTER COLUMN seat_count SET DEFAULT 0;
