export {
  HOTKEY_ACTION_IDS,
  HOTKEY_ACTIONS,
  isHotkeyActionId,
} from "@core/data/hotkeyActions";
export type {
  HotkeyActionId,
  HotkeyActionMetadata,
} from "@core/data/hotkeyActions";

import { HotkeyBinding } from "@app/utils/hotkeys";
import { HotkeyActionId } from "@core/data/hotkeyActions";

// Desktop builds can intercept Ctrl+Tab / Ctrl+Shift+Tab because the Tauri
// webview has no browser tab bar. These are reserved in every browser, so
// core (web) intentionally ships no default for these actions.
export const generateDefaultActionBindings = (
  _macLike: boolean,
): Partial<Record<HotkeyActionId, HotkeyBinding>> => ({
  "file.cycleNext": { code: "Tab", ctrl: true, shift: false },
  "file.cyclePrev": { code: "Tab", ctrl: true, shift: true },
});
