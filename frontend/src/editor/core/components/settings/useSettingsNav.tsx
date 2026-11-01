import { useConfigNavSections } from "@editor/components/shared/config/configNavSections";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import type { SettingsNav } from "@editor/components/settings/settingsNavTypes";
import { BASE_SECTION_ALIASES } from "@editor/data/settingsAliases";

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
