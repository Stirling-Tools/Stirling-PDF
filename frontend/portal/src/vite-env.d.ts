/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hosted SaaS Supabase project URL — in-app account-link login. Absent → link UI shows a configure state. */
  readonly VITE_SAAS_SUPABASE_URL?: string;
  /** Hosted SaaS Supabase anon/publishable key (public). */
  readonly VITE_SAAS_SUPABASE_ANON_KEY?: string;
  /** URL of the editor app (app switcher + non-admin redirect). See portal/.env. */
  readonly VITE_EDITOR_URL: string;
  /** Force MSW mocks on/off ("true"/"false"); empty falls back to dev default. */
  readonly VITE_PORTAL_MOCKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
