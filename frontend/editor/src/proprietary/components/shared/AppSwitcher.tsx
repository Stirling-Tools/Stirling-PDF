import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { useOtherAppSwitch } from "@app/hooks/useOtherAppSwitch";

/**
 * Sidebar brand header for builds that ship the processor. When this user can
 * open it, the Stirling logo doubles as the editor⇄processor switcher: the mark
 * morphs into a chevron and opens the switch menu (the same BrandSwitcher the
 * processor sidebar uses). Users without access get a plain logo.
 *
 * The access gate lives in {@link useOtherAppSwitch} so this header and the
 * sidebar footer's "Open PDF Processor" row are driven by one answer.
 */
export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  const otherApp = useOtherAppSwitch();

  if (!otherApp) {
    return (
      <Logo
        variant={collapsed ? "iconOnly" : "iconAndText"}
        iconHeight="1.6rem"
        textHeight="1.3rem"
      />
    );
  }

  return (
    <BrandSwitcher
      current="editor"
      onSwitch={otherApp.onOpen}
      collapsed={collapsed}
    />
  );
}
