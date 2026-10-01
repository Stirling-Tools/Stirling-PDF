import { useConfigNavSections } from "@app/components/shared/config/configNavSections";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { BASE_SECTION_ALIASES } from "@app/data/settingsAliases";

export type { SettingsNav };

/**
 * The settings sections this build ships, already gated by the signed-in
 * user's config. A per-flavor seam: SaaS shadows it to build from its own
 * (non-hook) nav factory, so the page itself stays flavor-agnostic.
 *
 * @param onLeave closes settings — the Help tours need the page out of the way
 *   before they can run.
 */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const { config } = useAppConfig();
  const sections = useConfigNavSections(
    config?.isAdmin ?? false,
    config?.runningEE ?? false,
    config?.enableLogin ?? false,
    onLeave,
    config?.showSettingsWhenNoLogin ?? true,
  );
  return { sections, aliases: BASE_SECTION_ALIASES };
}
