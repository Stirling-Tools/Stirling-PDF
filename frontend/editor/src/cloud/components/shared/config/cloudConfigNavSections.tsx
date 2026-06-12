import React from "react";
import { type TFunction } from "i18next";
import {
  type ConfigNavSection,
  type ConfigNavItem,
} from "@core/components/shared/config/configNavSections";
import Plan from "@app/components/shared/config/configSections/Plan";
import TeamSection from "@app/components/shared/config/configSections/TeamSection";

/**
 * Shared cloud config nav-section builder (@app/components/shared/config/cloudConfigNavSections).
 *
 * The cloud/ layer is the SHARED hosted experience consumed by BOTH the saas
 * (web) and desktop (Tauri) leaves. The Plan / Payg / spend-cap / Team settings
 * sections are identical across platforms — they render the same wallet-driven
 * {@link Plan} (which internally branches free vs subscribed × leader vs member
 * and pulls in the spend-cap editor + usage meters) and the same {@link
 * TeamSection}. Rather than each leaf hand-rolling these nav entries (and
 * drifting — desktop previously surfaced an entirely separate billing surface),
 * both leaves compose the cloud entries built here.
 *
 * The shells themselves stay per-leaf (saas drives nav via window.location +
 * the #6630 deep-link/overlay behavior; desktop drives nav via React Router +
 * SettingsSearchBar/UnsavedChanges), so this module only owns the SECTION LIST
 * pieces, not the modal chrome. Each leaf's thin nav wrapper composes
 * [these shared cloud sections] + [its leaf-only sections].
 */

/**
 * Optional translator. The live nav builders (hook-based) always pass `t`; the
 * deprecated non-hook `createConfigNavSections` path has no i18n in scope and
 * falls back to the default English labels.
 */
type Translate = TFunction<"translation", undefined> | undefined;

function label(t: Translate, key: string, fallback: string): string {
  return t ? t(key, fallback) : fallback;
}

/** The Plan (billing) nav item — wallet-driven PAYG dashboard + spend cap. */
export function createCloudPlanNavItem(t?: Translate): ConfigNavItem {
  return {
    key: "plan",
    label: label(t, "config.plan", "Plan"),
    icon: "credit-card",
    component: <Plan />,
  };
}

/** The Team nav item — shared SaaS team management (invite/rename/members). */
export function createCloudTeamNavItem(t?: Translate): ConfigNavItem {
  return {
    key: "teams",
    label: label(t, "config.team", "Team"),
    icon: "groups-rounded",
    component: <TeamSection />,
  };
}

/**
 * The Billing section wrapping the Plan item, for leaves that group billing in
 * its own nav section (saas). Desktop slots the same item into its own
 * "Plan & Billing" section title.
 */
export function createCloudBillingSection(
  t: TFunction<"translation", undefined>,
): ConfigNavSection {
  return {
    title: "Billing",
    items: [createCloudPlanNavItem(t)],
  };
}
