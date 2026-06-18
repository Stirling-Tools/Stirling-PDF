/**
 * OAuth provider types now live in the shared auth layer so the portal and the
 * editor agree on the contract. Re-exported here to preserve the existing
 * `@app/auth/oauthTypes` import path.
 */
export * from "@shared/auth/spring/oauthTypes";
