import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import {
  HomeIcon,
  UsersIcon,
  SourcesIcon,
  IntegrationsIcon,
  PipelinesIcon,
  StoreIcon,
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
  /** The whole tab is facts about the linked account, so unlinked is asked rather than navigated. */
  requiresLink?: boolean;
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

// The processor's own workflow: home plus the pipeline it feeds. Policies were folded into
// Pipelines (a policy is a pipeline the org requires), so there's no separate Policies tab.
export const GROUP_PROCESSOR: NavEntry[] = [
  { id: "home", icon: <HomeIcon /> },
  { id: "sources", icon: <SourcesIcon /> },
  { id: "pipelines", icon: <PipelinesIcon /> },
  { id: "store", icon: <StoreIcon />, requiresStore: true },
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
