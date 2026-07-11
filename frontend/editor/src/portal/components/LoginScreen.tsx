import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@app/auth/ui/AuthShell";
import LoginRightCarousel from "@app/auth/ui/LoginRightCarousel";
import { buildDefaultLoginSlides } from "@app/auth/ui/loginSlides";
import SpringLoginForm from "@app/auth/ui/SpringLoginForm";
import { useSpringLogin } from "@app/auth/ui/useSpringLogin";
import { withBasePath } from "@app/constants/app";
import "@app/auth/ui/auth-theme.css";
import "@app/auth/ui/auth.css";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";

/**
 * Full-screen login shown by the portal's auth gate. Renders the shared
 * AuthShell + carousel with the Spring form/auth wiring from @app/auth/ui.
 *
 * It follows the user's light/dark theme (AuthShell is theme-aware — the same
 * screen the editor login uses; passing both logo variants keeps the header
 * readable in either mode). The gate handles "already logged in", so this only
 * needs to collect credentials.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const login = useSpringLogin();
  const slides = useMemo(
    () => buildDefaultLoginSlides((key, fallback) => t(key, fallback)),
    [t],
  );

  return (
    <AuthShell
      rightPanel={
        <LoginRightCarousel
          imageSlides={slides}
          initialSeconds={5}
          slideSeconds={8}
        />
      }
    >
      <SpringLoginForm
        state={login}
        logoSrc={loginHeader}
        logoDarkSrc={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
      />
    </AuthShell>
  );
}
