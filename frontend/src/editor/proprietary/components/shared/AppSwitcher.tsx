import { useNavigate } from "react-router-dom";
import { useAuth } from "@editor/auth/context";
import { Logo } from "@editor/ui/Logo";
import { BrandSwitcher } from "@editor/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";

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
