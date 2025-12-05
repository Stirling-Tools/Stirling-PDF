/**
 * Known OAuth providers with dedicated UI support.
 * Custom providers are also supported - the backend determines availability.
 */
export const KNOWN_OAUTH_PROVIDERS = [
  'github',
  'google',
  'apple',
  'azure',
  'keycloak',
  'cloudron',
  'authentik',
  'oidc',
] as const;

export type KnownOAuthProvider = typeof KNOWN_OAUTH_PROVIDERS[number];

/**
 * OAuth provider ID - can be any known provider or custom string.
 * The backend configuration determines which providers are available.
 *
 * @example 'github' | 'google' | 'mycompany' | 'authentik'
 */
export type OAuthProvider = KnownOAuthProvider | (string & {});
