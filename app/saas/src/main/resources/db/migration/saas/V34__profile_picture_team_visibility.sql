-- Let teammates see each other's profile pictures.
--
-- Until now the profile-pictures bucket and its metadata table were readable only by their owner,
-- which is why the SaaS team roster fell back to initials. The policies below widen SELECT (only
-- SELECT) to "people you share a team with", matching what the self-hosted backend enforces in
-- ProfilePictureService.visibleUserIds. Writes stay owner-only: nobody can change anyone else's avatar.
--
-- Idempotent (DROP ... IF EXISTS before CREATE) so re-running is safe.

-- Team-mates of the calling user, resolved from the app's own tables. SECURITY DEFINER because the
-- caller cannot read users/team_memberships directly; the function returns only auth uuids, and is
-- restricted to authenticated callers.
CREATE OR REPLACE FUNCTION public.profile_picture_teammate_ids()
RETURNS TABLE (supabase_auth_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT peer.supabase_auth_id
    FROM users me
    JOIN team_memberships my_membership ON my_membership.user_id = me.user_id
    JOIN team_memberships peer_membership ON peer_membership.team_id = my_membership.team_id
    JOIN users peer ON peer.user_id = peer_membership.user_id
    WHERE me.supabase_auth_id = auth.uid()
      AND peer.supabase_auth_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.profile_picture_teammate_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_picture_teammate_ids() TO authenticated;

-- Storage: read a teammate's avatar at "<their auth uuid>/avatar". Compared as text, not cast to
-- uuid, so a stray object whose first path segment isn't a uuid can't error the whole policy.
DROP POLICY IF EXISTS "Teammates can view profile pictures" ON storage.objects;
CREATE POLICY "Teammates can view profile pictures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] IN (
        SELECT supabase_auth_id::text FROM public.profile_picture_teammate_ids()
    )
);

-- Metadata: the account page reads source/provider to know whether a picture is provider-synced.
-- Guarded because the metadata table is created by the Supabase-side avatar migration, which some
-- environments may not have applied yet.
DO $$
BEGIN
    IF to_regclass('public.profile_picture_metadata') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Teammates can view profile picture metadata"
            ON public.profile_picture_metadata;
        CREATE POLICY "Teammates can view profile picture metadata"
        ON public.profile_picture_metadata
        FOR SELECT
        TO authenticated
        USING (user_id IN (SELECT supabase_auth_id FROM public.profile_picture_teammate_ids()));
    END IF;
END
$$;
