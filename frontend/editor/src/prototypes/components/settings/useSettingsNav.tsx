/**
 * The prototypes sandbox has no @portal alias, so it must not resolve the
 * processor's settings sections — shadow the seam back to the core sections.
 */
export { useSettingsNav } from "@core/components/settings/useSettingsNav";
export type { SettingsNav } from "@app/components/settings/settingsNavTypes";
