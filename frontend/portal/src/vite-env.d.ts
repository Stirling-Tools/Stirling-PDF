/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SaaS Supabase project URL — account-link sign-in. May be absent in dev (MSW). */
  readonly VITE_SUPABASE_URL?: string;
  /** SaaS Supabase publishable (anon) key — account-link sign-in. May be absent in dev (MSW). */
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
