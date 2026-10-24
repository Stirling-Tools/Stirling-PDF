/**
 * The admin account a fresh server creates. Must match InitialSecuritySetup's
 * defaults; the backend only reports `showDefaultCredentials` while they work.
 */
export const DEFAULT_ADMIN_CREDENTIALS = {
  username: "admin",
  password: "stirling",
} as const;
