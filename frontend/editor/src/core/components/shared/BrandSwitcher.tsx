import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dropdown } from "@app/ui";
import { Logo } from "@app/ui/Logo";
import { BrandMark } from "@app/components/shared/BrandMark";
import {
  AppSwitchMenuItems,
  type AppSwitchTarget,
} from "@app/components/shared/AppSwitch";
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
  const [open, setOpen] = useState(false);

  return (
    <div className={`sui-brand-switcher${className ? ` ${className}` : ""}`}>
      <Dropdown.Root align="start" open={open} onOpenChange={setOpen}>
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
