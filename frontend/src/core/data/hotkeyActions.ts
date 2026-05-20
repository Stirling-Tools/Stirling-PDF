import { HotkeyBinding } from "@app/utils/hotkeys";

export const HOTKEY_ACTION_IDS = ["file.cycleNext", "file.cyclePrev"] as const;

export type HotkeyActionId = (typeof HOTKEY_ACTION_IDS)[number];

export const isHotkeyActionId = (value: string): value is HotkeyActionId =>
  (HOTKEY_ACTION_IDS as readonly string[]).includes(value);

export interface HotkeyActionMetadata {
  id: HotkeyActionId;
  nameKey: string;
  descriptionKey: string;
  fallbackName: string;
  fallbackDescription: string;
}

export const HOTKEY_ACTIONS: Record<HotkeyActionId, HotkeyActionMetadata> = {
  "file.cycleNext": {
    id: "file.cycleNext",
    nameKey: "settings.hotkeys.actions.fileCycleNext.name",
    descriptionKey: "settings.hotkeys.actions.fileCycleNext.description",
    fallbackName: "Switch to next file",
    fallbackDescription: "Cycle to the next open PDF",
  },
  "file.cyclePrev": {
    id: "file.cyclePrev",
    nameKey: "settings.hotkeys.actions.fileCyclePrev.name",
    descriptionKey: "settings.hotkeys.actions.fileCyclePrev.description",
    fallbackName: "Switch to previous file",
    fallbackDescription: "Cycle to the previous open PDF",
  },
};

// Browser builds ship with no default for file-cycle actions — every useful
// key combination is already reserved by some browser on some OS. Desktop
// builds override this function via the @app/* alias to return Ctrl+Tab /
// Ctrl+Shift+Tab, which are interceptable inside the Tauri webview.
export const generateDefaultActionBindings = (
  _macLike: boolean,
): Partial<Record<HotkeyActionId, HotkeyBinding>> => ({});
