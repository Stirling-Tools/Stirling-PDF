import { Suspense, lazy, type ComponentType } from "react";
import type { TFunction } from "i18next";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import type {
  ConfigNavItem,
  ConfigNavSection,
  NavKey,
} from "@app/components/shared/config/types";
import { HAS_PORTAL } from "@app/routes/hasPortal";

// Only the components come from the portal, and only through `lazy` behind the
// build flag: a static value import here would drag the portal chunk into every
// proprietary bundle, including ones built without the processor. The nav
// metadata stays static so the sidebar can be laid out without loading them.
type PortalSectionModule =
  typeof import("@portal/components/settings/portalSettingsSections");

function portalSection(
  pick: (m: PortalSectionModule) => ComponentType | null,
): ComponentType | null {
  if (!HAS_PORTAL) return null;
  const Lazy = lazy(async () => {
    const m =
      await import("@portal/components/settings/portalSettingsSections");
    const Picked = pick(m);
    return { default: Picked ?? (() => null) };
  });
  return function PortalSection() {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Lazy />
      </Suspense>
    );
  };
}

const UsersSection = portalSection((m) => m.PortalUsersSection);
const ApiKeysSection = portalSection((m) => m.PortalApiKeysSection);
const AuditSection = portalSection((m) => m.PortalAuditSection);
const EncryptionSection = portalSection((m) => m.PortalEncryptionSection);
const BillingSection = portalSection((m) => m.PortalBillingSection);
const AccountLinkSection = portalSection((m) => m.PortalAccountLinkSection);

/**
 * The processor's Users / Infrastructure / Usage & Billing views as settings
 * sections: administration of the whole deployment rather than a pipeline
 * step. Empty in builds without the portal.
 *
 * @param includeAccountLink self-hosted links the instance to a Stirling
 *   account; SaaS has nothing to link, so it passes false.
 * @param includeAudit SaaS has no other audit surface; self-hosted has the
 *   admin one under Security & sign-in and passes false.
 */
export function buildPortalSettingsSections(
  t: TFunction<"translation", undefined>,
  {
    includeAccountLink = true,
    includeAudit = false,
  }: { includeAccountLink?: boolean; includeAudit?: boolean } = {},
): ConfigNavSection[] {
  if (!UsersSection || !ApiKeysSection || !AuditSection || !BillingSection) {
    return [];
  }
  const workspace: ConfigNavItem[] = [
    {
      key: "users",
      label: t("portal.nav.users", "Users"),
      description: t(
        "users.subtitle2",
        "Your people, teams, and access levels.",
      ),
      icon: "group-rounded",
      component: <UsersSection />,
      fullBleed: true,
    },
    {
      key: "billing",
      label: t("portal.nav.usage", "Usage & Billing"),
      icon: "payments-rounded",
      component: <BillingSection />,
      fullBleed: true,
    },
  ];
  if (includeAccountLink && AccountLinkSection) {
    workspace.push({
      key: "account-link",
      label: t("portal.settings.sections.account-link", "Account link"),
      description: t(
        "portal.accountLink.panel.sub",
        "Link this self-hosted org to its Stirling account so unattended processing bills against your org wallet.",
      ),
      icon: "link-rounded",
      component: <AccountLinkSection />,
    });
  }
  const groups: ConfigNavSection[] = [
    {
      id: "workspace",
      title: t("settings.workspace.title", "Workspace"),
      items: workspace,
    },
    {
      id: "developer",
      title: t("settings.developer.title", "Developer"),
      items: [
        {
          key: "api-keys",
          label: t("settings.developer.apiKeys", "API Keys"),
          description: t(
            "settings.developer.apiKeysDescription",
            "Personal keys for calling the Stirling API from scripts and integrations.",
          ),
          icon: "key-rounded",
          component: <ApiKeysSection />,
          fullBleed: true,
        },
      ],
    },
  ];
  if (EncryptionSection) {
    groups.push({
      id: "server",
      title: t("settings.server.title", "Server"),
      items: [
        {
          key: "storage",
          label: t(
            "portal.infrastructure.encryption.heading",
            "Encryption at rest",
          ),
          description: t(
            "portal.infrastructure.encryption.subheading",
            "Stored files are encrypted before they reach disk, the database or object storage.",
          ),
          icon: "encrypted-rounded",
          component: <EncryptionSection />,
          fullBleed: true,
        },
      ],
    });
  }
  if (includeAudit) {
    groups.push({
      id: "security",
      title: t("settings.securityAuth.title", "Security & sign-in"),
      items: [
        {
          key: "audit",
          label: t("settings.licensingAnalytics.audit", "Audit log"),
          description: t(
            "settings.licensingAnalytics.auditDescription",
            "Who did what on this server, and how long that record is kept.",
          ),
          icon: "fact-check-rounded",
          component: <AuditSection />,
          fullBleed: true,
        },
      ],
    });
  }
  return groups;
}

/** Settings sections the portal ones supersede; dropped when they are shown. */
export const PORTAL_SUPERSEDED_SECTION_KEYS: readonly NavKey[] = [
  "people",
  "teams",
  "api-keys",
];

/** Where a superseded section's bookmarks and search results now land. */
export const PORTAL_SECTION_ALIASES: Partial<Record<string, NavKey>> = {
  people: "users",
  teams: "users",
  infrastructure: "api-keys",
  // The processor links to a build-neutral "audit"; self-hosted's is the admin one.
  audit: "adminAudit",
};
