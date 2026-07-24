import { useNavigate } from "react-router-dom";
import { useMantineColorScheme } from "@mantine/core";
import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

/**
 * SaaS sidebar brand header. When the backend says this user can open the
 * processor (`/api/v1/auth/me` → `portalAccess` — the exact signal the
 * processor's own gate uses), the Stirling logo doubles as the
 * editor⇄processor switcher: the mark morphs into a chevron and opens the
 * switch menu (same BrandSwitcher the processor sidebar uses). Users without
 * access get a plain logo.
 *
 * Deliberately NOT gated on the editor's Supabase auth context: that context
 * never fetches /me, so it can't know about portal access (and its session
 * state doesn't always mirror the backend login that actually grants it).
 */
export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  const portalAccess = usePortalAccess();
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();

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
      theme={colorScheme === "dark" ? "dark" : "light"}
      onSwitch={() => navigate(PORTAL_BASENAME)}
      collapsed={collapsed}
    />
  );
}
