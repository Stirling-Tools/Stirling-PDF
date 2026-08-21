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
 * desktop (Tauri) nav wrappers. The Plan (wallet-driven PAYG dashboard + spend
 * cap) and Team sections are identical across platforms; each leaf owns its own
 * modal chrome and appends its leaf-only sections around these.
 */

type Translate = TFunction<"translation", undefined>;

/** The Plan (billing) nav item — wallet-driven PAYG dashboard + spend cap. */
export function createCloudPlanNavItem(t: Translate): ConfigNavItem {
  return {
    key: "plan",
    label: t("config.plan", "Plan"),
    icon: "credit-card",
    component: <Plan />,
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
export function createCloudBillingSection(t: Translate): ConfigNavSection {
  return {
    title: "Billing",
    items: [createCloudPlanNavItem(t)],
  };
}
