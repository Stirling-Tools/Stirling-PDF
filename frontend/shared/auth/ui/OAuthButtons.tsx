import { useTranslation } from "react-i18next";
import { type OAuthProvider } from "@shared/auth/spring/oauthTypes";
import { Button } from "@mantine/core";
import googleIcon from "@shared/assets/login/google.svg";
import githubIcon from "@shared/assets/login/github.svg";
import appleIcon from "@shared/assets/login/apple.svg";
import microsoftIcon from "@shared/assets/login/microsoft.svg";
import keycloakIcon from "@shared/assets/login/keycloak.svg";
import cloudronIcon from "@shared/assets/login/cloudron.svg";
import authentikIcon from "@shared/assets/login/authentik.svg";
import oidcIcon from "@shared/assets/login/oidc.svg";

// Debug flag to show all providers for UI testing
// Set to true to see all SSO options regardless of backend configuration
export const DEBUG_SHOW_ALL_PROVIDERS = false;

// OAuth provider configuration - maps provider ID to display info
// Known providers get custom icons; unknown providers use generic SSO icon
export const oauthProviderConfig: Record<
  string,
  { label: string; file: string }
> = {
  google: { label: "Google", file: "google.svg" },
  github: { label: "GitHub", file: "github.svg" },
  apple: { label: "Apple", file: "apple.svg" },
  azure: { label: "Microsoft", file: "microsoft.svg" },
  keycloak: { label: "Keycloak", file: "keycloak.svg" },
  cloudron: { label: "Cloudron", file: "cloudron.svg" },
  authentik: { label: "Authentik", file: "authentik.svg" },
  oidc: { label: "OIDC", file: "oidc.svg" },
};

// Bundled icon URLs keyed by the filenames in oauthProviderConfig. Importing as
// modules (rather than reading from /Login/*.svg under a build-time BASE_PATH)
// lets the same component work in both the editor and the portal.
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

// Generic fallback for unknown providers
const GENERIC_PROVIDER_ICON = "oidc.svg";

const iconUrl = (file: string): string =>
  ICON_BY_FILE[file] ?? ICON_BY_FILE[GENERIC_PROVIDER_ICON];

interface OAuthButtonsProps {
  onProviderClick: (provider: OAuthProvider) => void;
  isSubmitting: boolean;
  layout?: "vertical" | "grid" | "icons";
  enabledProviders?: OAuthProvider[]; // List of full auth paths from backend (e.g., '/oauth2/authorization/google', '/saml2/authenticate/stirling')
  ctaPrefix?: string;
  styleVariant?: "neutral" | "tinted" | "outline" | "light";
  demoMode?: boolean;
  useNewStyle?: boolean;
}

export default function OAuthButtons({
  onProviderClick,
  isSubmitting,
  layout = "vertical",
  enabledProviders = [],
  ctaPrefix,
  styleVariant = "neutral",
  demoMode = false,
  useNewStyle = false,
}: OAuthButtonsProps) {
  const { t } = useTranslation();

  // Debug mode: show all providers for UI testing
  const providersToShow = DEBUG_SHOW_ALL_PROVIDERS
    ? Object.keys(oauthProviderConfig)
    : enabledProviders;

  // Build provider list - extract provider ID from full path for display
  const providers = providersToShow.map((pathOrId) => {
    // Extract provider ID from full path (e.g., '/saml2/authenticate/stirling' -> 'stirling')
    const providerId = pathOrId.split("/").pop() || pathOrId;

    if (providerId in oauthProviderConfig) {
      // Known provider - use predefined icon and label
      return {
        id: pathOrId, // Keep full path for redirect
        providerId, // Store extracted ID for display lookup
        ...oauthProviderConfig[providerId],
      };
    }
    // Unknown provider - use generic icon and capitalize ID for label
    return {
      id: pathOrId, // Keep full path for redirect
      providerId, // Store extracted ID for display lookup
      label: providerId.charAt(0).toUpperCase() + providerId.slice(1),
      file: GENERIC_PROVIDER_ICON,
    };
  });

  // If no providers are enabled, don't render anything
  if (providers.length === 0) {
    return null;
  }

  const isSingleProvider = providers.length === 1;
  const isTinted = styleVariant === "tinted";
  const isOutline = styleVariant === "outline";
  const isLight = styleVariant === "light";
  const accentMap: Record<string, string> = {
    google: "#4285F4",
    github: "#111827",
    apple: "#111827",
    azure: "#0078D4",
    keycloak: "#2C2C2C",
    cloudron: "#3B82F6",
    authentik: "#FA7B17",
    oidc: "#334155",
  };

  if (layout === "icons") {
    return (
      <div className="oauth-container-icons">
        {providers.map((p) => (
          <div
            key={p.id}
            title={`${t("login.signInWith", "Sign in with")} ${p.label}`}
          >
            <Button
              onClick={() => onProviderClick(p.id)}
              disabled={isSubmitting}
              className="oauth-button-icon"
              aria-label={`${t("login.signInWith", "Sign in with")} ${p.label}`}
              variant="default"
            >
              <img
                src={iconUrl(p.file)}
                alt={p.label}
                className="oauth-icon-small"
              />
            </Button>
          </div>
        ))}
      </div>
    );
  }

  if (layout === "grid") {
    return (
      <div className="oauth-container-grid">
        {providers.map((p) => (
          <div
            key={p.id}
            title={`${t("login.signInWith", "Sign in with")} ${p.label}`}
          >
            <Button
              onClick={() => onProviderClick(p.id)}
              disabled={isSubmitting}
              className="oauth-button-grid"
              aria-label={`${t("login.signInWith", "Sign in with")} ${p.label}`}
              variant="default"
            >
              <img
                src={iconUrl(p.file)}
                alt={p.label}
                className="oauth-icon-medium"
              />
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`oauth-container-vertical${useNewStyle && isSingleProvider ? " oauth-container-single" : ""}`}
    >
      {providers.map((p) => (
        <div
          key={p.id}
          title={`${t("login.signInWith", "Sign in with")} ${p.label}`}
        >
          <Button
            onClick={() => onProviderClick(p.id)}
            disabled={!demoMode && isSubmitting}
            className={`oauth-button-vertical${useNewStyle && isSingleProvider ? " oauth-button-vertical-single" : ""}${!useNewStyle ? " oauth-button-vertical-legacy" : ""}${isTinted ? " oauth-button-vertical-tinted" : ""}${isOutline ? " oauth-button-vertical-outline" : ""}${isLight ? " oauth-button-vertical-light" : ""}`}
            aria-label={`${t("login.signInWith", "Sign in with")} ${p.label}`}
            variant="default"
            style={
              isTinted
                ? ({
                    "--oauth-accent": accentMap[p.providerId] || "#334155",
                  } as React.CSSProperties)
                : undefined
            }
          >
            <span className="oauth-button-left">
              <span className="oauth-icon-wrapper">
                <img
                  src={iconUrl(p.file)}
                  alt={p.label}
                  className="oauth-icon-tiny"
                />
              </span>
              <span className="oauth-button-text">
                {ctaPrefix ? `${ctaPrefix} ${p.label}` : p.label}
              </span>
            </span>
            {useNewStyle && isSingleProvider && (
              <span className="oauth-button-right" aria-hidden="true">
                <svg
                  className="oauth-arrow-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M5 12h12m0 0-5-5m5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
