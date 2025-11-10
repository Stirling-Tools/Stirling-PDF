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
  export interface AxiosRequestConfig<_D = any> {
    suppressErrorToast?: boolean;
    skipBackendReadyCheck?: boolean;
  }

  export interface InternalAxiosRequestConfig<_D = any> {
    suppressErrorToast?: boolean;
    skipBackendReadyCheck?: boolean;
  }
}

export {};
