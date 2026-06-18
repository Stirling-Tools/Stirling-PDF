/**
 * OAuth redirect/session cleanup now lives in the shared auth layer.
 * Re-exported to preserve the existing `@app/auth/oauthStorage` import path.
 */
export * from "@shared/auth/spring/oauthStorage";
export { default } from "@shared/auth/spring/oauthStorage";
