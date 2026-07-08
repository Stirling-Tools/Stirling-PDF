import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import type { NavigateFunction } from "react-router-dom";
import { VIEW_PATHS, toPortalPath, type ViewId } from "@portal/contexts/ViewContext";

interface PortalTourStepSpec {
  view: ViewId;
  contentKey: string;
  contentDefault: string;
}

// The nav sections to walk through, top to bottom. Internal views only —
// external tabs (Developer Docs) and Settings are skipped. Mock data is on by
// default in dev, so each section renders populated as the tour visits it.
const PORTAL_TOUR_SPECS: PortalTourStepSpec[] = [
  {
    view: "home",
    contentKey: "portal.tour.home",
    contentDefault:
      "This is your <strong>Home</strong> dashboard — a snapshot of documents processed, policy activity, and usage at a glance.",
  },
  {
    view: "users",
    contentKey: "portal.tour.users",
    contentDefault:
      "<strong>Users</strong> — invite teammates, manage roles, and control who can access the processor.",
  },
  {
    view: "sources",
    contentKey: "portal.tour.sources",
    contentDefault:
      "<strong>Sources</strong> — connect the folders and locations that documents arrive from.",
  },
  {
    view: "policies",
    contentKey: "portal.tour.policies",
    contentDefault:
      "<strong>Policies</strong> — automated rules that run on every document as it arrives: classify it, redact sensitive information, add watermarks, sanitise metadata, and more.",
  },
  {
    view: "pipelines",
    contentKey: "portal.tour.pipelines",
    contentDefault:
      "<strong>Pipelines</strong> — chain operations together into reusable document workflows.",
  },
  {
    view: "documents",
    contentKey: "portal.tour.documents",
    contentDefault:
      "<strong>Documents</strong> — browse everything the processor has handled, with its status and history.",
  },
  {
    view: "components",
    contentKey: "portal.tour.components",
    contentDefault:
      "<strong>Components</strong> — the reusable building blocks your policies and pipelines are made from.",
  },
  {
    view: "infrastructure",
    contentKey: "portal.tour.infrastructure",
    contentDefault:
      "<strong>Infrastructure</strong> — monitor the health and capacity of your processor.",
  },
  {
    view: "usage",
    contentKey: "portal.tour.usage",
    contentDefault:
      "<strong>Usage & Billing</strong> — track consumption and manage your plan.",
  },
];

/**
 * Builds the portal "show me around" tour: one spotlight per left-nav section,
 * navigating to that section as the step is entered so its (mock) content is
 * visible behind the popover.
 */
export function createPortalTourSteps(
  navigate: NavigateFunction,
  t: TFunction,
): StepType[] {
  return PORTAL_TOUR_SPECS.map((spec) => ({
    selector: `[data-tour="portal-nav-${spec.view}"]`,
    content: t(spec.contentKey, spec.contentDefault),
    // Sit below the nav item so the popover doesn't cover the section content
    // to the right.
    position: "bottom",
    padding: 10,
    action: () => {
      navigate(toPortalPath(VIEW_PATHS[spec.view]));
    },
  }));
}
