/**
 * Bundled OAuth provider icons: the single source for provider brand SVGs.
 *
 * Importing them as modules (rather than referencing /Login/*.svg under a
 * build-time BASE_PATH) lets every consumer (the shared OAuthButtons, the
 * editor's saas/desktop login buttons, and the config provider list) share one
 * copy that works in both the editor and the processor bundles.
 */
import googleIcon from "@app/assets/login/google.svg";
import githubIcon from "@app/assets/login/github.svg";
import appleIcon from "@app/assets/login/apple.svg";
import microsoftIcon from "@app/assets/login/microsoft.svg";
import keycloakIcon from "@app/assets/login/keycloak.svg";
import cloudronIcon from "@app/assets/login/cloudron.svg";
import authentikIcon from "@app/assets/login/authentik.svg";

/** Filename used for a provider with no bundled artwork. */
export const GENERIC_PROVIDER_ICON = "oidc.svg";

const ICON_BY_FILE: Record<string, string> = {
  "google.svg": googleIcon,
  "github.svg": githubIcon,
  "apple.svg": appleIcon,
  "microsoft.svg": microsoftIcon,
  "keycloak.svg": keycloakIcon,
  "cloudron.svg": cloudronIcon,
  "authentik.svg": authentikIcon,
};

/** Whether a bundled mark exists for this filename. */
export function hasProviderArtwork(file: string): boolean {
  return Object.hasOwn(ICON_BY_FILE, file);
}

/** Resolve a provider icon filename (e.g. "google.svg") to its bundled URL. */
export function oauthIconUrl(file: string): string {
  return ICON_BY_FILE[file] ?? "";
}
