import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import { Icon } from "@app/ui/Icon";
export interface NavEntry {
  id: ViewId;
  icon: ReactNode;
  /** When set, the tab opens this URL in a new tab instead of navigating in-app. */
  externalUrl?: string;
  /** The whole tab is facts about the linked account, so unlinked is asked rather than navigated. */
  requiresLink?: boolean;
}

export interface NavGroup {
  /** i18n key for the section header shown above the group. */
  labelKey: string;
  entries: NavEntry[];
}

// Sidebar nav groups. This is a flavor seam: the SaaS build shadows this file to
// drop sections not yet shipped there (see src/portal-saas/components/sidebarGroups).

// The processor's own workflow: home plus the pipeline it feeds. Policies were folded into
// Pipelines (a policy is a pipeline the org requires), so there's no separate Policies tab.
export const GROUP_PROCESSOR: NavEntry[] = [
  { id: "home", icon: <Icon name="house" size={18} /> },
  { id: "sources", icon: <Icon name="plug" size={18} /> },
  { id: "pipelines", icon: <Icon name="workflow" size={18} /> },
  { id: "documents", icon: <Icon name="file-text" size={18} /> },
];

// The wider platform around the processor: people, connections, infra, billing, docs.
export const GROUP_PLATFORM: NavEntry[] = [
  { id: "users", icon: <Icon name="users" size={18} /> },
  { id: "integrations", icon: <Icon name="plug-zap" size={18} /> },
  { id: "infrastructure", icon: <Icon name="server" size={18} /> },
  {
    id: "usage",
    icon: <Icon name="chart-column" size={18} />,
    requiresLink: true,
  },
  { id: "docs", icon: <Icon name="book-open" size={18} /> },
];
