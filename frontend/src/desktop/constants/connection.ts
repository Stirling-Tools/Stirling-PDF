/**
 * Connection-related constants for desktop app
 */

// SaaS server URL from environment variable
// The SaaS authentication server
export const STIRLING_SAAS_URL: string = import.meta.env.VITE_SAAS_SERVER_URL || '';

// SaaS signup URL for creating new cloud accounts
export const STIRLING_SAAS_SIGNUP_URL: string = import.meta.env.VITE_SAAS_SIGNUP_URL || '';

// Supabase publishable key from environment variable
// Used for SaaS authentication
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || 'sb_publishable_UHz2SVRF5mvdrPHWkRteyA_yNlZTkYb';
