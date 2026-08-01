/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Used by all builds (.env)
  readonly VITE_API_BASE_URL: string;
  /** "true" includes the admin portal's lazy route/chunk in the editor build. */
  readonly VITE_INCLUDE_PORTAL: string;
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID: string;
  readonly VITE_GOOGLE_DRIVE_API_KEY: string;
  readonly VITE_GOOGLE_DRIVE_APP_ID: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;

  // SaaS only (.env.saas)
  readonly VITE_USERBACK_TOKEN: string;
  readonly VITE_DEV_BYPASS_AUTH: string;
  /** Role-based login landing: default "dynamic" (team leads → processor,
   *  members → editor); set to "editor" to keep everyone on the editor. */
  readonly VITE_LOGIN_LANDING_MODE: string;

  // Desktop only (.env.desktop)
  readonly VITE_DESKTOP_BACKEND_URL: string;
  readonly VITE_SAAS_SERVER_URL: string;
  readonly VITE_SAAS_BACKEND_API_URL: string;
  /** When "true" (dev only), desktop auth treats JWT as expired — see authService.shouldSimulateExpiredJwt */
  readonly VITE_DEV_SIMULATE_EXPIRED_JWT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Dev-only worktree folder basename injected by vite.config at dev-serve time
 * (empty string in production builds). Used to prefix the browser tab title so
 * concurrent worktrees are distinguishable.
 */
declare const __DEV_WORKTREE_LABEL__: string;
