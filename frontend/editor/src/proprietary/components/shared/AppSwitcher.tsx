import { useAuth } from "@app/auth/context";
import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { useAppSwitch } from "@app/components/shared/AppSwitchProvider";

export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  const { portalAccess } = useAuth();
  const { switchToApp } = useAppSwitch();

  if (!portalAccess) {
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
      onSwitch={() => switchToApp("processor")}
      collapsed={collapsed}
    />
  );
}
