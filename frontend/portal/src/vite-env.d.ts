/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the editor app (app switcher + non-admin redirect). See portal/.env. */
  readonly VITE_EDITOR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
