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
  { requiresProcessor = true }: { requiresProcessor?: boolean } = {},
): ComponentType | null {
  if (requiresProcessor && !HAS_PORTAL) return null;
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

// Org administration, not a processor surface, so it is the one section a build
// without the processor still gets. Still lazy: unopened means unpulled.
const UsersSection = portalSection((m) => m.PortalUsersSection, {
  requiresProcessor: false,
});
const ApiKeysSection = portalSection((m) => m.PortalApiKeysSection);
const AuditSection = portalSection((m) => m.PortalAuditSection);
const EncryptionSection = portalSection((m) => m.PortalEncryptionSection);
const BillingSection = portalSection((m) => m.PortalBillingSection);
const AccountLinkSection = portalSection((m) => m.PortalAccountLinkSection);

/**
 * Deployment-administration sections; endpoints enforce the same access rules.
 * The roster is shared across builds and does not require the processor.
 * Self-hosted billing and account linking require org ownership; SaaS has no server to link.
 */
export function buildPortalSettingsSections(
  t: TFunction<"translation", undefined>,
  {
    includeAccountLink = true,
    includeAudit = false,
    includeEncryption = false,
    includeBilling = true,
    includeRoster = true,
    includeApiKeys = true,
  }: {
    includeAccountLink?: boolean;
    includeAudit?: boolean;
    includeEncryption?: boolean;
    includeBilling?: boolean;
    includeRoster?: boolean;
    includeApiKeys?: boolean;
  } = {},
): ConfigNavSection[] {
  const workspace: ConfigNavItem[] = [];
  if (UsersSection && includeRoster) {
    workspace.push({
      key: "users",
      label: t("portal.nav.users", "Users"),
      description: t(
        "users.subtitle2",
        "Your people, teams, and access levels.",
      ),
      icon: "users",
      component: <UsersSection />,
      fullBleed: true,
    });
  }
  if (includeBilling && BillingSection) {
    workspace.push({
      key: "billing",
      label: t("portal.nav.usage", "Usage & Billing"),
      icon: "credit-card",
      component: <BillingSection />,
      fullBleed: true,
    });
  }
  if (includeAccountLink && AccountLinkSection) {
    workspace.push({
      key: "account-link",
      label: t("portal.settings.sections.account-link", "Account connection"),
      description: t(
        "portal.accountLink.panel.sub",
        "Manage this server’s connection to your Stirling Cloud account.",
      ),
      icon: "link",
      component: <AccountLinkSection />,
      fullBleed: true,
    });
  }
  const groups: ConfigNavSection[] =
    workspace.length > 0
      ? [
          {
            id: "workspace",
            title: t("settings.workspace.title", "Workspace"),
            items: workspace,
          },
        ]
      : [];
  // Keys belong to you, not the server, so they join your own settings. Only the
  // processor's tab supersedes the build's own; without it the build keeps its own.
  if (ApiKeysSection && includeApiKeys) {
    groups.push({
      id: "preferences",
      title: t("settings.preferences.title", "Preferences"),
      mergeAt: "append",
      items: [
        {
          key: "api-keys",
          label: t("settings.developer.apiKeys", "API Keys"),
          description: t(
            "settings.developer.apiKeysDescription",
            "Personal keys for calling the Stirling API from scripts and integrations.",
          ),
          icon: "key",
          component: <ApiKeysSection />,
          fullBleed: true,
        },
      ],
    });
  }
  if (includeEncryption && EncryptionSection) {
    groups.push({
      id: "server",
      title: t("settings.server.title", "Server"),
      mergeAt: "append",
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
          icon: "lock-keyhole",
          component: <EncryptionSection />,
          fullBleed: true,
        },
      ],
    });
  }
  if (includeAudit && AuditSection) {
    groups.push({
      id: "monitoring",
      title: t("settings.monitoring.title", "Monitoring"),
      mergeAt: "append",
      items: [
        {
          key: "audit",
          label: t("settings.licensingAnalytics.audit", "Audit log"),
          description: t(
            "settings.licensingAnalytics.auditDescription",
            "Who did what on this server, and how long that record is kept.",
          ),
          icon: "clipboard-check",
          component: <AuditSection />,
          fullBleed: true,
        },
      ],
    });
  }
  return groups;
}

/** Settings sections the given portal sections supersede, to drop from the build's
 *  own nav. Derived from what was built: dropping an unreplaced key deletes it. */
export function portalSupersededSectionKeys(
  sections: readonly ConfigNavSection[],
): NavKey[] {
  const provided = new Set(
    sections.flatMap((group) => group.items.map((item) => item.key)),
  );
  const superseded: NavKey[] = [];
  if (provided.has("users")) {
    // The cloud builds carry their own roster under "users"; the processor's is
    // the superset, so it replaces rather than duplicates it.
    superseded.push("people", "teams", "users");
  }
  if (provided.has("api-keys")) superseded.push("api-keys");
  if (provided.has("billing")) superseded.push("plan", "adminPlan");
  return superseded;
}

/** Where a superseded section's bookmarks and search results now land. */
export const PORTAL_SECTION_ALIASES: Partial<Record<string, NavKey>> = {
  people: "users",
  teams: "users",
  infrastructure: "api-keys",
  plan: "billing",
  adminPlan: "billing",
  // The processor links to a build-neutral "audit"; self-hosted's is the admin one.
  audit: "adminAudit",
};
