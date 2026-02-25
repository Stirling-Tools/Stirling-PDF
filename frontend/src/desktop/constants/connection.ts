/**
 * Connection-related constants for desktop app
 */

// SaaS server URL from environment variable
// The SaaS authentication server (Supabase)
export const STIRLING_SAAS_URL: string = import.meta.env.VITE_SAAS_SERVER_URL || '';

// SaaS backend API URL from environment variable
// The Stirling SaaS backend API server (for team endpoints, etc.)
export const STIRLING_SAAS_BACKEND_API_URL: string = import.meta.env.VITE_SAAS_BACKEND_API_URL || '';

// Supabase publishable key from environment variable
// Used for SaaS authentication
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb';

// Desktop deep link callback for Supabase email confirmations
export const DESKTOP_DEEP_LINK_CALLBACK = 'stirlingpdf://auth/callback';

// Validation warnings
if (!STIRLING_SAAS_BACKEND_API_URL) {
  console.warn('[Desktop Connection] VITE_SAAS_BACKEND_API_URL not configured - SaaS backend APIs (teams, etc.) will not work');
}
