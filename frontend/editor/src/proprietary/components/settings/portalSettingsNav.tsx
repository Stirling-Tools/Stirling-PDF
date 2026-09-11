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

// The roster is org administration, not a processor surface, so it is the one
// section a build without the processor still gets. Still lazy: a build that
// never opens it never pulls the chunk.
const UsersSection = portalSection((m) => m.PortalUsersSection, {
  requiresProcessor: false,
});
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
 *   admin one under Monitoring and passes false.
 * @param includeEncryption encryption at rest is deployment-wide server
 *   configuration, so only a self-hosted admin can act on it. SaaS operates
 *   the storage itself and passes false for every user.
 * @param includeBilling what the deployment spends is the operator's business,
 *   not every member's, so self-hosted passes its admin flag. On SaaS the
 *   signed-in account owns the wallet, so it stays on.
 * @param includeRoster off for a viewer with no business administering people.
 *   Unlike the rest, this one does not need the processor: it is the build's
 *   only roster.
 * @param includeApiKeys the processor's keys tab, which supersedes the build's
 *   own. Off without processor access, so the build keeps its own.
 *
 * These flags only decide what is offered: the endpoints behind each section
 * enforce the same rule server-side.
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
  if (!UsersSection || !includeRoster) {
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
  ];
  if (includeBilling && BillingSection) {
    workspace.push({
      key: "billing",
      label: t("portal.nav.usage", "Usage & Billing"),
      icon: "payments-rounded",
      component: <BillingSection />,
      fullBleed: true,
    });
  }
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
  ];
  // Keys belong to you, not to the server, so they join your own settings
  // rather than standing alone under a heading of their own. Only the
  // processor's keys tab supersedes the build's own, so a build without it
  // keeps that one rather than losing the section.
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
          icon: "key-rounded",
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
          icon: "encrypted-rounded",
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
          icon: "fact-check-rounded",
          component: <AuditSection />,
          fullBleed: true,
        },
      ],
    });
  }
  return groups;
}

/**
 * Settings sections the given portal sections supersede, to drop from the
 * build's own nav.
 *
 * <p>Derived from what was actually built rather than listed once: a build
 * without the processor still gets the roster but not the processor's keys tab,
 * and dropping a key nothing replaces would delete the section outright.
 */
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
  return superseded;
}

/** Where a superseded section's bookmarks and search results now land. */
export const PORTAL_SECTION_ALIASES: Partial<Record<string, NavKey>> = {
  people: "users",
  teams: "users",
  infrastructure: "api-keys",
  // The processor links to a build-neutral "audit"; self-hosted's is the admin one.
  audit: "adminAudit",
};
