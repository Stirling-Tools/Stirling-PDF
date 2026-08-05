import { Logo } from "@app/ui/Logo";

export interface AppSwitcherProps {
  /** Icon-only brand mark for the collapsed rail. */
  collapsed?: boolean;
}

/**
 * Sidebar brand header. Core has no admin portal to switch to, so it just
 * shows the Stirling logo. Builds that bundle the portal (proprietary/saas)
 * shadow this with a version whose logo doubles as the editor⇄processor
 * switcher.
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
