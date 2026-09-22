import type { DocsManifest } from "@app/docs/manifest/transform";

const corrections: Record<string, readonly (readonly [string, string])[]> = {
  "configuration/configuration": [
    [
      "- OAuth2 (Google, GitHub, Keycloak, OIDC) - Team tier",
      "- OAuth2 (Google, GitHub, Keycloak, OIDC) - All tiers, including Free; user limits apply",
    ],
  ],
  "configuration/operations/performance-optimization": [
    [
      "**Team or Enterprise plans** provide SSO, external database support",
      "**Team or Enterprise plans** provide additional user capacity, external database support",
    ],
  ],
  "configuration/security/oauth-sso-configuration": [
    [
      "> **Tier**: Team",
      "> **Tier**: All tiers, including Free. User limits still apply.",
    ],
    [
      "- [ ] Valid license for the Team tier or higher",
      "- [ ] Available user capacity for new accounts (existing users can still sign in at the limit)",
    ],
    [
      "- Auto-login feature requires the Team tier (or higher)",
      "- Auto-login is available on every tier; new accounts must fit within the user limit",
    ],
  ],
  "configuration/security/saml-sso-configuration": [
    [
      "(doc:configuration/security/oauth-sso-configuration) (Team tier).",
      "(doc:configuration/security/oauth-sso-configuration) (all tiers, including Free; user limits apply).",
    ],
  ],
  "configuration/security/single-sign-on-configuration": [
    [
      "> **Tier**: Team",
      "> **Tier**: All tiers, including Free. User limits still apply.",
    ],
  ],
  "getting-started": [
    [
      "- **Enterprise Features:** SSO (OAuth2 and SAML), user management, permission controls, and audit logging.",
      "- **Single Sign-On:** OAuth2/OIDC on every tier, including Free, within your user limit.\n- **Enterprise Features:** SAML SSO, user management, permission controls, and audit logging.",
    ],
  ],
  "modes-and-licensing": [
    [
      "advanced features (SSO, SAML, audit logs, etc.)",
      "advanced features (SAML, audit logs, etc.)",
    ],
    [
      "- SSO, SAML, audit logging, and other paid-tier features",
      "- SAML, audit logging, and other paid-tier features",
    ],
    [
      "**No credits ever.** License tier determines your user capacity",
      "**No credits ever.** OAuth2/OIDC SSO is included on every tier. License tier determines your user capacity",
    ],
  ],
  "paid-offerings": [
    [
      "  - Regular updates\n- **Perfect for**: Personal use",
      "  - Regular updates\n  - [OAuth2 SSO](doc:configuration/security/oauth-sso-configuration) (Google, GitHub, Keycloak, any OIDC provider), within the user limit\n- **Perfect for**: Personal use",
    ],
  ],
  "server-admin-onboarding": [
    [
      "external database, Google Drive, SSO, advanced user management",
      "external database, Google Drive, SAML SSO, advanced user management",
    ],
    [
      "**OAuth2:** Team tier -",
      "**OAuth2:** All tiers, including Free; user limits apply -",
    ],
    ["- **OAuth2 SSO:** Team tier (Google, GitHub, Keycloak, OIDC)\n", ""],
  ],
};

export function applyOAuthLicensing(manifest: DocsManifest): void {
  for (const [id, replacements] of Object.entries(corrections)) {
    const doc = manifest.docs[id];
    if (!doc) continue;
    for (const [before, after] of replacements) {
      doc.markdown = doc.markdown.replaceAll(before, after);
    }
  }
}
