import type { PanPluginConfig } from "@embedpdf/plugin-pan";

// The plugin's own defaultConfig is "mobile", which makes pan the global default
// mode on any touch-capable device and locks activateDefaultMode into pan (#5175).
export const VIEWER_PAN_CONFIG: PanPluginConfig = {
  defaultMode: "never",
};
