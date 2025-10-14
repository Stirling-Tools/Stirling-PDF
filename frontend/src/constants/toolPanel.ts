// Tool panel constants

export const ALL_TOOL_PANEL_MODES = ['sidebar', 'fullscreen'] as const;
export type ToolPanelMode = typeof ALL_TOOL_PANEL_MODES[number];

export function isToolPanelMode(mode: string): mode is ToolPanelMode {
  return ALL_TOOL_PANEL_MODES.includes(mode as ToolPanelMode);
}

export const DEFAULT_TOOL_PANEL_MODE: ToolPanelMode = 'sidebar';
