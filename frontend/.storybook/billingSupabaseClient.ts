import { createClient } from "@supabase/supabase-js";

// Isolate legacy billing stories from the SaaS auth client configured in preview.
export const isSupabaseConfigured = true;
export const supabase = createClient(
  "http://billing.mock",
  "storybook-anon-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
