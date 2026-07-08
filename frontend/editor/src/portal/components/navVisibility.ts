import type { ViewId } from "@portal/contexts/ViewContext";

/**
 * Nav entries the sidebar should hide for the current build flavor. Self-hosted
 * shows the full nav, so this is empty. The SaaS build shadows this file to hide
 * views that aren't wired up there yet (see portal-saas/components/navVisibility).
 */
export const HIDDEN_NAV_VIEWS: ReadonlySet<ViewId> = new Set();
