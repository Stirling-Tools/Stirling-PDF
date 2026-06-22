/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hosted SaaS login origin — account-link popup auth. May be absent in dev (uses stub). */
  readonly VITE_SAAS_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
