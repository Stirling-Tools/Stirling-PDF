import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  bindingMatchesEvent,
  getDisplayParts,
  isMacLike,
  type HotkeyBinding,
} from "@app/utils/hotkeys";
import "@app/components/shared/AppSwitch.css";

export type AppSwitchTarget = "editor" | "processor";

/**
 * Shortcut for jumping straight to the other app. Lives in the Cmd/Ctrl+Alt
 * namespace the app already owns for quick-access tools (see HotkeyContext),
 * and is matched on `code` so it survives non-Latin keyboard layouts.
 *
 * Not part of the rebindable hotkey registry: that one is keyed by tool id and
 * only mounts in the editor, while this key has to work in both apps.
 */
export const APP_SWITCH_BINDING: HotkeyBinding = {
  code: "KeyS",
  alt: true,
  meta: isMacLike(),
  ctrl: !isMacLike(),
};

/**
 * Binds the shortcut while `enabled`. Callers pass their own gate so the key is
 * never live for someone the switch would only bounce off an auth gate.
 */
export function useAppSwitchShortcut(
  current: AppSwitchTarget,
  onSwitch: (app: AppSwitchTarget) => void,
  enabled = true,
) {
  // Two apps, so switching is a toggle: whichever one this is not.
  const other: AppSwitchTarget = current === "editor" ? "processor" : "editor";
  // Through a ref so the listener binds once: callers pass an inline onSwitch.
  const latest = useRef({ other, onSwitch });
  latest.current = { other, onSwitch };

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!bindingMatchesEvent(APP_SWITCH_BINDING, event)) return;
      // Never take the key off a text field (Ctrl+Alt is AltGr on Windows
      // layouts) or out from under a modal. The target is only sometimes an
      // element - document and window fire this too - so narrow it first.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, [contenteditable="true"], [role="textbox"], [role="dialog"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      latest.current.onSwitch(latest.current.other);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** The shortcut rendered as key caps, for the switch menu's trailing slot. */
export function AppSwitchShortcutHint() {
  return (
    <span className="sui-app-switch__keys" aria-hidden>
      {getDisplayParts(APP_SWITCH_BINDING, isMacLike()).map((part) => (
        <kbd key={part}>{part}</kbd>
      ))}
    </span>
  );
}

interface AppSwitchMenuItemsProps {
  /** The app this switcher is rendered in (shown as active in the menu). */
  current: AppSwitchTarget;
  /** Invoked with the selected app; only called for apps other than `current`. */
  onSwitch: (app: AppSwitchTarget) => void;
}

/** The editor / processor items for an app-switch menu. */
export function AppSwitchMenuItems({
  current,
  onSwitch,
}: AppSwitchMenuItemsProps) {
  const { t } = useTranslation();
  const apps: Array<{ id: AppSwitchTarget; label: string }> = [
    {
      id: "processor",
      label: t("portal.shell.sidebar.appProcessor", "Processor"),
    },
    { id: "editor", label: t("portal.shell.sidebar.appEditor", "Editor") },
  ];
  return (
    <>
      {apps.map((app) => (
        <Dropdown.Item
          key={app.id}
          active={current === app.id}
          onSelect={app.id === current ? undefined : () => onSwitch(app.id)}
          leading={<BrandMark height="1.125rem" />}
          // Only on the app the key would actually take you to - there are two,
          // so the shortcut is a toggle rather than a per-app binding.
          trailing={app.id === current ? undefined : <AppSwitchShortcutHint />}
        >
          {app.label}
        </Dropdown.Item>
      ))}
    </>
  );
}
