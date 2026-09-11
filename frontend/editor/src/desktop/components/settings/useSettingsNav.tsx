/**
 * Desktop ships no processor, but it does ship the roster — which is a portal
 * module — so it takes proprietary's seam rather than core's. The processor's
 * own sections resolve to null here (HAS_PORTAL is false), leaving the roster
 * as the only portal surface desktop mounts.
 */
export { useSettingsNav } from "@proprietary/components/settings/useSettingsNav";
export type { SettingsNav } from "@app/components/settings/settingsNavTypes";
