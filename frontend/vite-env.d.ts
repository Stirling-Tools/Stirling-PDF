/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Shared (core + proprietary + desktop)
  readonly VITE_API_BASE_URL: string;
  readonly VITE_GOOGLE_DRIVE_CLIENT_ID: string;
  readonly VITE_GOOGLE_DRIVE_API_KEY: string;
  readonly VITE_GOOGLE_DRIVE_APP_ID: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;

  // Desktop only (.env.desktop)
  readonly VITE_DESKTOP_BACKEND_URL: string;
  readonly VITE_SAAS_SERVER_URL: string;
  readonly VITE_SAAS_BACKEND_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
