import { useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/context";
import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  const { portalAccess } = useAuth();
  const navigate = useNavigate();

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
      onSwitch={() => navigate(PORTAL_BASENAME)}
      collapsed={collapsed}
    />
  );
}
