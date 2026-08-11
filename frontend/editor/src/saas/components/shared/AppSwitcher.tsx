import { useNavigate } from "react-router-dom";
import { Logo } from "@app/ui/Logo";
import { BrandSwitcher } from "@app/components/shared/BrandSwitcher";
import { type AppSwitcherProps } from "@core/components/shared/AppSwitcher";
import { useProcessorAccess } from "@app/hooks/useProcessorAccess";
import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";

/**
 * SaaS sidebar brand header. When the backend says this user can open the
 * processor (`/api/v1/auth/me` → `processorAccess` — the exact signal the
 * processor's own gate uses), the Stirling logo doubles as the
 * editor⇄processor switcher: the mark morphs into a chevron and opens the
 * switch menu (same BrandSwitcher the processor sidebar uses). Users without
 * access get a plain logo.
 *
 * Deliberately NOT gated on the editor's Supabase auth context: that context
 * never fetches /me, so it can't know about processor access (and its session
 * state doesn't always mirror the backend login that actually grants it).
 */
export function AppSwitcher({ collapsed }: AppSwitcherProps) {
  const processorAccess = useProcessorAccess();
  const navigate = useNavigate();

  if (!processorAccess) {
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
      onSwitch={() => navigate(PROCESSOR_BASENAME)}
      collapsed={collapsed}
    />
  );
}
