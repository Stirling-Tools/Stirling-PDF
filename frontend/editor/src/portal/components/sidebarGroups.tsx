import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import {
  HomeIcon,
  SourcesIcon,
  IntegrationsIcon,
  PipelinesIcon,
  DocumentsIcon,
} from "@portal/components/icons";

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

// The processor's own workflow: home, the pipeline it feeds, and what it connects out to.
// Policies were folded into Pipelines (a policy is a pipeline the org requires), so there's no
// separate Policies tab.
export const GROUP_PROCESSOR: NavEntry[] = [
  { id: "home", icon: <HomeIcon /> },
  { id: "sources", icon: <SourcesIcon /> },
  { id: "pipelines", icon: <PipelinesIcon /> },
  { id: "documents", icon: <DocumentsIcon /> },
  { id: "integrations", icon: <IntegrationsIcon /> },
];

/**
 * Empty on purpose, so the flavor seam and the shell keep their shape. Server
 * administration (users, infrastructure, billing) is product-wide and lives on
 * the settings page; the docs browser is reference material and lives at /docs.
 */
export const GROUP_PLATFORM: NavEntry[] = [];
