import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@editor-core/components/settings/useSettingsNav";
import type { SettingsNav } from "@editor/components/settings/settingsNavTypes";
import { usePortalAccessState } from "@editor/hooks/usePortalAccess";
import { useAuth } from "@editor/auth/context";
import { usePortalSettingsOptions } from "@editor/components/settings/usePortalSettingsOptions";
import { mergeSettingsGroups } from "@editor/components/settings/mergeSettingsGroups";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  portalSupersededSectionKeys,
} from "@editor/components/settings/portalSettingsNav";

export type { SettingsNav };

/**
 * Self-hosted settings: the build's own sections, plus the processor's server
 * administration (Team / Infrastructure / Usage & Billing). Where the two
 * overlap the processor's view wins — it is a superset (roles, teams,
 * processor access, audit) — so the narrower section is dropped rather than
 * shown twice, and its key aliases across.
 *
 * Which sections it carries is the {@link usePortalSettingsOptions} seam.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const { settled: accessSettled } = usePortalAccessState();
  const { loading } = useAuth();
  const options = usePortalSettingsOptions();

  const portalSections = useMemo(
    () => (options ? buildPortalSettingsSections(t, options) : []),
    [options, t],
  );

  const sections = useMemo(
    () =>
      mergeSettingsGroups(base.sections, portalSections, [
        "plan",
        "adminPlan",
        ...portalSupersededSectionKeys(portalSections),
      ]),
    [base.sections, portalSections],
  );

  const portalAliases = { ...PORTAL_SECTION_ALIASES };
  if (
    !portalSections.some((group) =>
      group.items.some((item) => item.key === "users"),
    )
  ) {
    delete portalAliases.people;
    delete portalAliases.teams;
  }
  if (
    !portalSections.some((group) =>
      group.items.some((item) => item.key === "billing"),
    )
  ) {
    delete portalAliases.plan;
    delete portalAliases.adminPlan;
  }

  return {
    ...base,
    sections,
    pending: !accessSettled || loading,
    aliases:
      portalSections.length > 0
        ? { ...base.aliases, ...portalAliases }
        : base.aliases,
  };
}
