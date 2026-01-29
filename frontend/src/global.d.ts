declare module "*.js";
declare module '*.module.css';

// Auto-generated icon set JSON import
declare module 'assets/material-symbols-icons.json' {
  const value: {
    prefix: string;
    icons: Record<string, any>;
    width?: number;
    height?: number;
  };
  export default value;
}

declare module 'axios' {
  export interface AxiosRequestConfig<_D = unknown> {
    suppressErrorToast?: boolean;
    skipAuthRedirect?: boolean;
    skipBackendReadyCheck?: boolean;
  }

  export interface InternalAxiosRequestConfig<_D = unknown> {
    suppressErrorToast?: boolean;
    skipAuthRedirect?: boolean;
    skipBackendReadyCheck?: boolean;
  }
}

export {};
