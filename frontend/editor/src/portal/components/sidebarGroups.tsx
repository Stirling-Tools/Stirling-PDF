import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import {
  HomeIcon,
  UsersIcon,
  SourcesIcon,
  IntegrationsIcon,
  PoliciesIcon,
  PipelinesIcon,
  DocumentsIcon,
  InfrastructureIcon,
  UsageIcon,
  DocsIcon,
} from "@portal/components/icons";

export interface NavEntry {
  id: ViewId;
  icon: ReactNode;
  /** When set, the tab opens this URL in a new tab instead of navigating in-app. */
  externalUrl?: string;
  /**
   * The whole tab needs a linked Stirling account, so an unlinked instance is asked for one
   * instead of being navigated. Unlike the create/edit guards, which let you look around, there
   * is nothing to look at here: usage and billing are facts about the linked account.
   */
  requiresLink?: boolean;
}

export interface NavGroup {
  /** i18n key for the section header shown above the group. */
  labelKey: string;
  entries: NavEntry[];
}

// Sidebar nav groups. This is a flavor seam: the SaaS build shadows this file to
// drop sections not yet shipped there (see src/portal-saas/components/sidebarGroups).

// The processor's own workflow: home plus the pipeline it feeds.
export const GROUP_PROCESSOR: NavEntry[] = [
  { id: "home", icon: <HomeIcon /> },
  { id: "sources", icon: <SourcesIcon /> },
  { id: "policies", icon: <PoliciesIcon /> },
  { id: "pipelines", icon: <PipelinesIcon /> },
  { id: "documents", icon: <DocumentsIcon /> },
];

// The wider platform around the processor: people, connections, infra, billing, docs.
export const GROUP_PLATFORM: NavEntry[] = [
  { id: "users", icon: <UsersIcon /> },
  { id: "integrations", icon: <IntegrationsIcon /> },
  { id: "infrastructure", icon: <InfrastructureIcon /> },
  { id: "usage", icon: <UsageIcon />, requiresLink: true },
  { id: "docs", icon: <DocsIcon /> },
];
