import { type ReactNode } from "react";
import { type ViewId } from "@portal/contexts/ViewContext";
import {
  HomeIcon,
  UsersIcon,
  SourcesIcon,
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
}

// Developer docs has no built-in portal page yet, so the tab opens the hosted docs
// site in a new tab rather than routing to an empty page.
const DEVELOPER_DOCS_URL = "https://docs.stirlingpdf.com/";

// Sidebar nav groups. This is a flavor seam: the SaaS build shadows this file to
// drop sections not yet shipped there (see src/portal-saas/components/sidebarGroups).
export const GROUP_PRIMARY: NavEntry[] = [{ id: "home", icon: <HomeIcon /> }];

export const GROUP_OPERATIONAL: NavEntry[] = [
  { id: "users", icon: <UsersIcon /> },
  { id: "sources", icon: <SourcesIcon /> },
  { id: "policies", icon: <PoliciesIcon /> },
  { id: "pipelines", icon: <PipelinesIcon /> },
  { id: "documents", icon: <DocumentsIcon /> },
];

export const GROUP_PLATFORM: NavEntry[] = [
  { id: "infrastructure", icon: <InfrastructureIcon /> },
  { id: "usage", icon: <UsageIcon /> },
  { id: "docs", icon: <DocsIcon />, externalUrl: DEVELOPER_DOCS_URL },
];
