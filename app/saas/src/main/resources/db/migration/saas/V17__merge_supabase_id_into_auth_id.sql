-- Consolidate users.supabase_id into users.supabase_auth_id.
--
-- The `supabase_auth_id` column is the canonical link to Supabase Auth — it was
-- created by the initial Supabase schema migration (Sep 2025) and is referenced
-- by every RLS policy in the Supabase side of the world (V14's
-- payg_team_ext_select / payg_team_ext_leader_update, the public.payg_*
-- SECURITY DEFINER RPCs, etc.).
--
-- PR #6384 ("SaaS Consolidation") accidentally added a parallel `supabase_id`
-- column via Flyway V2 — same purpose, different name. Java's User entity then
-- mapped to this new column. The result was a split-brain:
--   * Pre-#6384 users had supabase_auth_id populated, supabase_id NULL.
--   * Post-#6384 users had supabase_id populated, supabase_auth_id NULL.
--   * RLS policies + RPCs always check supabase_auth_id, so post-#6384 users
--     failed every membership check.
--
-- This migration:
--   1. Backfills supabase_auth_id from supabase_id where the former is NULL.
--   2. Drops the supabase_id column and its unique index.
--
-- The Java User entity has been switched to @Column(name = "supabase_auth_id")
-- in the same change-set; this migration assumes the new code is already
-- deployed (or will be deployed together with this migration).

-- 1. Backfill the canonical column from the duplicate, where needed.
UPDATE users
   SET supabase_auth_id = supabase_id
 WHERE supabase_auth_id IS NULL
   AND supabase_id IS NOT NULL;

-- 2. Drop the duplicate column. IF EXISTS guards against environments where
--    the column was already removed manually.
DROP INDEX IF EXISTS uk_users_supabase_id;
ALTER TABLE users DROP COLUMN IF EXISTS supabase_id;
