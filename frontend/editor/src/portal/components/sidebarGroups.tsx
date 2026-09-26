import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import { Icon } from "@app/ui/Icon";

export interface NavEntry {
  id: ViewId;
  icon: ReactNode;
  /** When set, the tab opens this URL in a new tab instead of navigating in-app. */
  externalUrl?: string;
  /** Hidden from a member. The view reports instance-wide figures behind ADMIN-gated endpoints. */
  requiresAdmin?: boolean;
  /** Hidden entirely unless this backend can reach the Pipeline store (see useStoreAvailable). */
  requiresStore?: boolean;
}

export interface NavGroup {
  /** i18n key for the section header shown above the group. */
  labelKey: string;
  entries: NavEntry[];
}

// Sidebar nav groups. This is a flavor seam: the SaaS build shadows this file to
// drop sections not yet shipped there (see src/portal-saas/components/sidebarGroups).

// The processor's own workflow: home, the pipeline it feeds, and what it connects out to.
// Policies were folded into Pipelines (a policy is a pipeline the org requires), so there's no
// separate Policies tab.
export const GROUP_PROCESSOR: NavEntry[] = [
  { id: "home", icon: <Icon name="house" size={18} /> },
  { id: "sources", icon: <Icon name="plug" size={18} /> },
  { id: "pipelines", icon: <Icon name="workflow" size={18} /> },
  { id: "store", icon: <Icon name="store" size={18} />, requiresStore: true },
  { id: "documents", icon: <Icon name="file-text" size={18} /> },
  { id: "review", icon: <Icon name="clipboard-check" size={18} /> },
  { id: "integrations", icon: <Icon name="blocks" size={18} /> },
];

/**
 * Empty on purpose, so the flavor seam and the shell keep their shape. Server
 * administration (users, infrastructure, billing) is product-wide and lives on
 * the settings page; the docs browser is reference material and lives at /docs.
 */
export const GROUP_PLATFORM: NavEntry[] = [];
