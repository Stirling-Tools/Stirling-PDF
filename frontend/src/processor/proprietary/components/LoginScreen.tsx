import { AuthShell } from "@editor/auth/ui/AuthShell";
import SpringLoginForm from "@editor/auth/ui/SpringLoginForm";
import { useSpringLogin } from "@editor/auth/ui/useSpringLogin";
import { withBasePath } from "@editor/constants/app";
import "@editor/auth/ui/auth-theme.css";
import "@editor/auth/ui/auth.css";
import loginHeader from "@editor/assets/brand/modern-logo/LoginLightModeHeader.svg";

/**
 * Full-screen login shown by the portal's auth gate. Renders the shared
 * AuthShell with the Spring form/auth wiring from @editor/auth/ui.
 *
 * It follows the user's light/dark theme (AuthShell is theme-aware — the same
 * screen the editor login uses; passing both logo variants keeps the header
 * readable in either mode). The gate handles "already logged in", so this only
 * needs to collect credentials.
 */
export function LoginScreen() {
  const login = useSpringLogin();

  return (
    <AuthShell>
      <SpringLoginForm
        state={login}
        logoSrc={loginHeader}
        logoDarkSrc={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
      />
    </AuthShell>
  );
}
