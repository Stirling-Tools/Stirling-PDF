/**
 * Bundled OAuth provider icons: the single source for provider brand SVGs.
 *
 * Importing them as modules (rather than referencing /Login/*.svg under a
 * build-time BASE_PATH) lets every consumer (the shared OAuthButtons, the
 * editor's saas/desktop login buttons, and the config provider list) share one
 * copy that works in both the editor and the portal bundles.
 */
import googleIcon from "@shared/assets/login/google.svg";
import githubIcon from "@shared/assets/login/github.svg";
import appleIcon from "@shared/assets/login/apple.svg";
import microsoftIcon from "@shared/assets/login/microsoft.svg";
import keycloakIcon from "@shared/assets/login/keycloak.svg";
import cloudronIcon from "@shared/assets/login/cloudron.svg";
import authentikIcon from "@shared/assets/login/authentik.svg";
import oidcIcon from "@shared/assets/login/oidc.svg";

/** Generic fallback icon (filename) for unknown providers. */
export const GENERIC_PROVIDER_ICON = "oidc.svg";

const ICON_BY_FILE: Record<string, string> = {
  "google.svg": googleIcon,
  "github.svg": githubIcon,
  "apple.svg": appleIcon,
  "microsoft.svg": microsoftIcon,
  "keycloak.svg": keycloakIcon,
  "cloudron.svg": cloudronIcon,
  "authentik.svg": authentikIcon,
  "oidc.svg": oidcIcon,
};

/** Resolve a provider icon filename (e.g. "google.svg") to its bundled URL. */
export function oauthIconUrl(file: string): string {
  return ICON_BY_FILE[file] ?? ICON_BY_FILE[GENERIC_PROVIDER_ICON];
}
