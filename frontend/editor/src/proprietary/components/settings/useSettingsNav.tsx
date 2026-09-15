import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@core/components/settings/useSettingsNav";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import { useAuth } from "@app/auth/context";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";
import {
  buildPortalSettingsSections,
  PORTAL_SECTION_ALIASES,
  PORTAL_SUPERSEDED_SECTION_KEYS,
} from "@app/components/settings/portalSettingsNav";

export type { SettingsNav };

/**
 * Self-hosted settings: the build's own sections, plus the processor's server
 * administration (Team / Infrastructure / Usage & Billing). Where the two
 * overlap the processor's view wins — it is a superset (roles, teams,
 * processor access, audit) — so the narrower section is dropped rather than
 * shown twice, and its key aliases across.
 *
 * Billing and cloud account connections belong to the org owner. Other admins
 * retain server configuration and operational usage analytics.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const { granted: portalAccess, settled: accessSettled } =
    usePortalAccessState();
  const { isAdmin, user, loading } = useAuth();
  const isOwner = isAdmin && !loading && user?.orgOwner === true;

  const portalSections = useMemo(
    () =>
      portalAccess
        ? buildPortalSettingsSections(t, {
            includeEncryption: isAdmin,
            includeBilling: isOwner,
            includeAccountLink: isOwner,
          })
        : [],
    [portalAccess, isAdmin, isOwner, t],
  );

  const sections = useMemo(
    () =>
      portalSections.length === 0
        ? base.sections
        : mergeSettingsGroups(
            base.sections,
            portalSections,
            PORTAL_SUPERSEDED_SECTION_KEYS,
          ),
    [base.sections, portalSections],
  );

  return {
    ...base,
    sections,
    pending: !accessSettled || loading,
    aliases:
      portalSections.length > 0
        ? { ...base.aliases, ...PORTAL_SECTION_ALIASES }
        : base.aliases,
  };
}
