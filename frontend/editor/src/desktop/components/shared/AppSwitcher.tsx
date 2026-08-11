import { Logo } from "@app/ui/Logo";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";

/**
 * Desktop inherits proprietary's layers but does not ship the processor (see
 * desktop/routes/adminRouteExtensions), so there's nothing to switch to —
 * shadow the brand header back to a plain logo. (Also avoids the desktop
 * bundle referencing @processor via the proprietary switcher's imports.)
 */
export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  return (
    <Logo
      variant={collapsed ? "iconOnly" : "iconAndText"}
      iconHeight="1.6rem"
      textHeight="1.3rem"
    />
  );
}
