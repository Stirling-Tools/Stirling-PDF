/**
 * Global window typings for Google Drive picker integration.
 */

declare global {
  interface Window {
    gapi: typeof gapi;
    google: typeof google;
  }
}

export {};
