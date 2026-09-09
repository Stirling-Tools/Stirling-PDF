/// <reference types="gapi" />
/// <reference types="gapi.client.drive-v3" />
/// <reference types="google.accounts" />
/// <reference types="google.picker" />

declare module "*.js";
declare module "*.module.css";

// Auto-generated icon set JSON import
declare module "assets/material-symbols-icons.json" {
  const value: {
    prefix: string;
    icons: Record<string, unknown>;
    width?: number;
    height?: number;
  };
  export default value;
}

declare global {
  interface Window {
    __STIRLING_PDF_BASE_URL__?: string;
    STIRLING_PDF_API_BASE_URL?: string;
    endpointAvailabilityService?: unknown;
    pdfjsLib?: typeof import("pdfjs-dist");
    /**
     * File System Access API directory picker. Not in the DOM lib; present in
     * Chromium and Firefox, absent in older Safari, so callers feature-detect.
     */
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | string;
    }) => Promise<FileSystemDirectoryHandle>;
  }

  /**
   * Non-standard permission methods on File System Access handles (Chromium
   * only; absent in Firefox/Safari). Optional so callers must feature-detect.
   */
  interface FileSystemHandle {
    queryPermission?: (descriptor?: {
      mode?: "read" | "readwrite";
    }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: {
      mode?: "read" | "readwrite";
    }) => Promise<PermissionState>;
  }
}

declare module "axios" {
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
