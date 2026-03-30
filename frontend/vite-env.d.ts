/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Used by all builds (.env)
  readonly VITE_API_BASE_URL: string;
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
  readonly VITE_RUN_SUBPATH: string;
  readonly VITE_DEV_BYPASS_AUTH: string;

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
