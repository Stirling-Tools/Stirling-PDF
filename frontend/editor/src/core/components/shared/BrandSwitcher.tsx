import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dropdown } from "@app/ui";
import { Logo } from "@app/ui/Logo";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  APP_SWITCH_BINDING,
  AppSwitchMenuItems,
  type AppSwitchTarget,
} from "@app/components/shared/AppSwitch";
import { useAppSwitch } from "@app/components/shared/AppSwitchProvider";
import { bindingMatchesEvent } from "@app/utils/hotkeys";
import "@app/components/shared/BrandSwitcher.css";

interface BrandSwitcherProps {
  /** The app this is rendered in (shown active in the menu). */
  current: AppSwitchTarget;
  /** Called with the selected app (only for the non-current one). */
  onSwitch: (app: AppSwitchTarget) => void;
  /** Icon-only: drop the wordmark, keep the morphing mark as the trigger. */
  collapsed?: boolean;
  className?: string;
}

/**
 * Brand lockup that doubles as the editor⇄processor switcher. The whole logo
 * is the dropdown trigger: on hover / focus / open the mark morphs into a
 * downward chevron (see BrandMark), so no separate chevron button is needed.
 * Shared so the editor and the processor present one identical header.
 */
export function BrandSwitcher({
  current,
  onSwitch,
  collapsed = false,
  className,
}: BrandSwitcherProps) {
  const { t } = useTranslation();
  const { preloadApp } = useAppSwitch();
  const [open, setOpen] = useState(false);
  // Two apps, so switching is a toggle: whichever one this is not.
  const other: AppSwitchTarget = current === "editor" ? "processor" : "editor";

  // Opening the menu is the earliest reliable signal of intent to switch, so
  // that is where the other app's code starts loading - by the time an item is
  // picked, the arrival has nothing left to fetch.
  const onOpenChange = (next: boolean) => {
    if (next) preloadApp(other);
    setOpen(next);
  };

  // Read through a ref so the listener binds once instead of on every render:
  // callers pass an inline onSwitch, whose identity changes each time.
  const latest = useRef({ other, onSwitch });
  latest.current = { other, onSwitch };

  // The switcher owns the shortcut because it is rendered exactly where
  // switching is possible - the editor shows a plain logo instead to users
  // without processor access - so the key is never live for someone it would
  // only bounce off an auth gate.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!bindingMatchesEvent(APP_SWITCH_BINDING, event)) return;
      // Never take the key off a text field (on Windows layouts where AltGr is
      // Ctrl+Alt this combo can be a real character) or out from under a modal.
      // The target is only sometimes an element - document and window fire this
      // event too - so it has to be narrowed before reaching for closest().
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
      setOpen(false);
      latest.current.onSwitch(latest.current.other);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={`sui-brand-switcher${className ? ` ${className}` : ""}`}>
      <Dropdown.Root align="start" open={open} onOpenChange={onOpenChange}>
        <Dropdown.Trigger>
          <Button
            variant="quiet"
            data-brandmark-morph
            className={`sui-brand-switcher__trigger${open ? " is-open" : ""}`}
            aria-label={t("portal.shell.sidebar.switchApp", "Switch app")}
            leftSection={<BrandMark height="1.6rem" />}
          >
            {!collapsed && <Logo variant="textOnly" textHeight="1.3rem" />}
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Menu width="11rem">
          <AppSwitchMenuItems current={current} onSwitch={onSwitch} />
        </Dropdown.Menu>
      </Dropdown.Root>
    </div>
  );
}
