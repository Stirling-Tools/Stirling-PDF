import { useTranslation } from "react-i18next";
import { Dropdown } from "@app/ui";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  getDisplayParts,
  isMacLike,
  type HotkeyBinding,
} from "@app/utils/hotkeys";

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

/**
 * The editor / processor items for the app-switch menu. Rendered inside the
 * BrandSwitcher's logo dropdown, which both apps use as their switcher. The
 * mark is the shared <BrandMark>, which recolours itself from the theme
 * tokens, so no colour-scheme prop needs threading down here.
 */
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
