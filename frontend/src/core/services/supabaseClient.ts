import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rficokptxxxxtyzcvgmx.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb';

// Check if Supabase is configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Create client only if configured, otherwise export null
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Log warning if not configured (for self-hosted installations)
if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Checkout and billing features will be disabled. ' +
    'Static plan information will be displayed instead.'
  );
}
