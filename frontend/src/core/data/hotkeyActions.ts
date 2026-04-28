import { HotkeyBinding } from "@app/utils/hotkeys";

export const HOTKEY_ACTION_IDS = [
  "file.cycleNext",
  "file.cyclePrev",
] as const;

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

// Detect Tauri without importing the SDK from core code (preserves layering).
const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
};

export const generateDefaultActionBindings = (
  macLike: boolean,
): Partial<Record<HotkeyActionId, HotkeyBinding>> => {
  // In the browser, Ctrl+Tab is reserved for switching browser tabs and cannot
  // be reliably intercepted, so leave file-cycle actions unbound by default.
  // The user can still assign a binding manually from settings.
  if (!isTauriRuntime()) {
    return {};
  }

  return {
    "file.cycleNext": {
      code: "Tab",
      ctrl: !macLike,
      meta: macLike,
      alt: false,
      shift: false,
    },
    "file.cyclePrev": {
      code: "Tab",
      ctrl: !macLike,
      meta: macLike,
      alt: false,
      shift: true,
    },
  };
};
