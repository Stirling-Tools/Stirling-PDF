import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@core/components/settings/useSettingsNav";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { useAuth } from "@app/auth/context";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useRosterAvailable } from "@app/hooks/useRosterAvailable";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  portalSupersededSectionKeys,
} from "@app/components/settings/portalSettingsNav";

export type { SettingsNav };

/**
 * Self-hosted settings: the build's own sections, plus the processor's server
 * administration (Team / Infrastructure / Usage & Billing). Where the two
 * overlap the processor's view wins — it is a superset (roles, teams,
 * processor access, audit) — so the narrower section is dropped rather than
 * shown twice, and its key aliases across.
 *
 * Admins manage encryption; only the organization owner manages billing and
 * the Stirling account connection. Portal access alone grants neither.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const { isAdmin, user, loading } = useAuth();
  const isOwner = isAdmin && !loading && user?.orgOwner === true;
  // Answers to the same admin flag the rest of the nav is built from, not the
  // session's - the two disagree while /me is still in flight.
  const { config } = useAppConfig();
  const navAdmin = config?.isAdmin ?? false;
  const rosterAvailable = useRosterAvailable();

  const portalSections = useMemo(
    () =>
      buildPortalSettingsSections(t, {
        // The roster is this build's only one, so it does not wait on processor
        // access the way the processor's own surfaces do.
        includeRoster: rosterAvailable && (navAdmin || portalAccess),
        includeApiKeys: portalAccess,
        includeEncryption: portalAccess && isAdmin,
        includeBilling: portalAccess && isOwner,
        includeAccountLink: portalAccess && isOwner,
      }),
    [portalAccess, isAdmin, isOwner, navAdmin, rosterAvailable, t],
  );

  const sections = useMemo(
    () =>
      mergeSettingsGroups(
        base.sections,
        portalSections,
        portalSupersededSectionKeys(portalSections),
      ),
    [base.sections, portalSections],
  );

  const portalAliases = { ...PORTAL_SECTION_ALIASES };
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
