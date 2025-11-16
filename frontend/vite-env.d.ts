/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_BASE_URLS?: string;
  readonly VITE_API_BACKEND_STRATEGY?: 'round-robin' | 'random';
  readonly VITE_API_BACKEND_FAILURE_COOLDOWN_MS?: string;
  readonly VITE_DESKTOP_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
