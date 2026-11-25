import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as desktopSupabase } from "@editor/auth/supabase";
import { OPEN_SIGN_IN_EVENT } from "@editor/constants/signInEvents";
import * as server from "@processor-proprietary/auth/sessionClient";
import { editionFunction } from "@processor/edition";

/**
 * Cloud: the desktop's own Supabase client, which holds no session; callers pass
 * the desktop token explicitly. Server: the separate billing session for the
 * linked Stirling account.
 */
export const getPortalSessionClient = editionFunction<
  [],
  SupabaseClient | null
>(() => desktopSupabase, server.getPortalSessionClient);

export const ensurePortalSessionClient = editionFunction<
  [],
  SupabaseClient | null
>(() => desktopSupabase, server.ensurePortalSessionClient);

/** Cloud: the expired session is the desktop's own, so sign in again. */
export const handlePortalSessionRequired = editionFunction<[], void>(() => {
  window.dispatchEvent(
    new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { locked: false } }),
  );
}, server.handlePortalSessionRequired);
