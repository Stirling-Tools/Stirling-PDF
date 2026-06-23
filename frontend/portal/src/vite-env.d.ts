/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hosted SaaS login origin — account-link popup auth. May be absent in dev (uses stub). */
  readonly VITE_SAAS_WEB_URL?: string;
  /** URL of the editor app (app switcher + non-admin redirect). See portal/.env. */
  readonly VITE_EDITOR_URL: string;
  /** Force MSW mocks on/off ("true"/"false"); empty falls back to dev default. */
  readonly VITE_PORTAL_MOCKS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
