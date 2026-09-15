import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsNav as useCoreSettingsNav } from "@core/components/settings/useSettingsNav";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { useProcessorAccessState } from "@app/hooks/useProcessorAccess";
import { useAuth } from "@app/auth/context";
import { mergeSettingsGroups } from "@app/components/settings/mergeSettingsGroups";
import {
  buildProcessorSettingsSections,
  PORTAL_SECTION_ALIASES,
  PORTAL_SUPERSEDED_SECTION_KEYS,
} from "@app/components/settings/processorSettingsNav";

export type { SettingsNav };

/**
 * Self-hosted settings: the build's own sections, plus the processor's server
 * administration (Team / Infrastructure / Usage & Billing). Where the two
 * overlap the processor's view wins — it is a superset (roles, teams,
 * processor access, audit) — so the narrower section is dropped rather than
 * shown twice, and its key aliases across.
 *
 * Encryption at rest, what the deployment spends, and the link to the Stirling
 * account are all operator concerns, so they are offered to admins only;
 * portal access alone is not enough to reach them.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { t } = useTranslation();
  const base = useCoreSettingsNav(onLeave);
  const { granted: processorAccess, settled: accessSettled } =
    useProcessorAccessState();
  const { isAdmin } = useAuth();

  const processorSections = useMemo(
    () =>
      processorAccess
        ? buildProcessorSettingsSections(t, {
            includeEncryption: isAdmin,
            includeBilling: isAdmin,
            includeAccountLink: isAdmin,
          })
        : [],
    [processorAccess, isAdmin, t],
  );

  const sections = useMemo(
    () =>
      processorSections.length === 0
        ? base.sections
        : mergeSettingsGroups(
            base.sections,
            processorSections,
            PORTAL_SUPERSEDED_SECTION_KEYS,
          ),
    [base.sections, processorSections],
  );

  return {
    ...base,
    sections,
    pending: !accessSettled,
    aliases:
      processorSections.length > 0
        ? { ...base.aliases, ...PORTAL_SECTION_ALIASES }
        : base.aliases,
  };
}
