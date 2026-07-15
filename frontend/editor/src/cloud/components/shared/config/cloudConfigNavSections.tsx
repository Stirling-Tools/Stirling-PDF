import React from "react";
import { type TFunction } from "i18next";
import {
  type ConfigNavSection,
  type ConfigNavItem,
} from "@core/components/shared/config/configNavSections";
import Plan from "@app/components/shared/config/configSections/Plan";
import TeamSection from "@app/components/shared/config/configSections/TeamSection";

/**
 * Shared cloud config nav-section builders, composed by both the saas (web) and
 * desktop (Tauri) nav wrappers. The Plan (read-only plan/usage snapshot that
 * deep-links to the portal) and Team sections are identical across platforms;
 * each leaf owns its own modal chrome and appends its leaf-only sections around
 * these.
 */

type Translate = TFunction<"translation", undefined>;

/**
 * The Plan (billing) nav item — a read-only plan/usage snapshot that deep-links
 * to the portal's Usage & Billing surface. {@code onRequestClose} lets the CTA
 * dismiss the settings modal before navigating.
 */
export function createCloudPlanNavItem(
  t: Translate,
  onRequestClose?: () => void,
): ConfigNavItem {
  return {
    key: "plan",
    label: t("config.plan", "Plan"),
    icon: "credit-card",
    component: <Plan onRequestClose={onRequestClose} />,
  };
}

/** The Team nav item — shared SaaS team management (invite/rename/members). */
export function createCloudTeamNavItem(t: Translate): ConfigNavItem {
  return {
    key: "teams",
    label: t("config.team", "Team"),
    icon: "groups-rounded",
    component: <TeamSection />,
  };
}

/** Billing nav section wrapping the Plan item, for leaves that group it (saas). */
export function createCloudBillingSection(
  t: Translate,
  onRequestClose?: () => void,
): ConfigNavSection {
  return {
    title: "Billing",
    items: [createCloudPlanNavItem(t, onRequestClose)],
  };
}
