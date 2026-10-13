/**
 * Sign-in provider marks, keyed by the icon filename a provider config names
 * (e.g. "google.svg"). The marks themselves are brand icons in the registry,
 * so every consumer renders them through <Icon> and they work in both the
 * editor and the portal bundles.
 */
import type { IconName } from "@app/ui/Icon";

/** Filename used for a provider with no bundled artwork. */
export const GENERIC_PROVIDER_ICON = "oidc.svg";

const ICON_BY_FILE: Record<string, IconName> = {
  "google.svg": "google",
  "github.svg": "github",
  "apple.svg": "apple",
  "microsoft.svg": "microsoft",
  "keycloak.svg": "keycloak",
  "cloudron.svg": "cloudron",
  "authentik.svg": "authentik",
};

/** The registry mark for a provider icon filename, or null when none is bundled. */
export function oauthIconName(file: string): IconName | null {
  return Object.hasOwn(ICON_BY_FILE, file) ? ICON_BY_FILE[file] : null;
}
