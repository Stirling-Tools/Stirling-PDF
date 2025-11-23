/**
 * Connection-related constants for desktop app
 */

// SaaS server URL from environment variable (required)
// The SaaS authentication server
// Will throw error if VITE_SAAS_SERVER_URL is not set
if (!import.meta.env.VITE_SAAS_SERVER_URL) {
  throw new Error('VITE_SAAS_SERVER_URL environment variable is required');
}

export const STIRLING_SAAS_URL = import.meta.env.VITE_SAAS_SERVER_URL;
