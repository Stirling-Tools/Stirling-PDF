import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@shared/auth/ui/AuthShell";
import LoginRightCarousel from "@shared/auth/ui/LoginRightCarousel";
import { buildDefaultLoginSlides } from "@shared/auth/ui/loginSlides";
import SpringLoginForm from "@shared/auth/ui/SpringLoginForm";
import { useSpringLogin } from "@shared/auth/ui/useSpringLogin";
import "@shared/auth/ui/auth-theme.css";
import "@shared/auth/ui/auth.css";
import loginHeader from "@shared/assets/brand/modern-logo/LoginLightModeHeader.svg";

/**
 * Full-screen login shown by the portal's auth gate. Renders the same screen as
 * the editor: the shared AuthShell + carousel, with the form body and Spring
 * auth wiring from @shared/auth/ui (SpringLoginForm + useSpringLogin). The gate
 * handles "already logged in", so this only needs to collect credentials.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const login = useSpringLogin();
  const slides = useMemo(
    () => buildDefaultLoginSlides((key, fallback) => t(key, fallback)),
    [t],
  );

  // Auth pages render in light mode (the shared screen uses light-only tokens).
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-mantine-color-scheme");
    html.setAttribute("data-mantine-color-scheme", "light");
    return () => {
      if (previous) html.setAttribute("data-mantine-color-scheme", previous);
    };
  }, []);

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
      <SpringLoginForm state={login} logoSrc={loginHeader} />
    </AuthShell>
  );
}
