/**
 * Desktop inherits proprietary's app but ships no portal, so it must not
 * resolve @portal — shadow the seam back to the core sections.
 */
export { useSettingsNav } from "@core/components/settings/useSettingsNav";
export type { SettingsNav } from "@app/components/settings/settingsNavTypes";
