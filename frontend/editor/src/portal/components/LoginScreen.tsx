import AuthLayout from "@app/routes/authShared/AuthLayout";
import SpringLoginForm from "@app/auth/ui/SpringLoginForm";
import { useSpringLogin } from "@app/auth/ui/useSpringLogin";
import { withBasePath } from "@app/constants/app";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";

/**
 * Full-screen login shown by the portal's auth gate. Uses the same theme-aware
 * layout as the editor login (AuthLayout + Spring form + light/dark logos), so
 * it follows the user's light/dark preference instead of being pinned to light.
 * The gate handles "already logged in", so this only needs to collect
 * credentials.
 */
export function LoginScreen() {
  const login = useSpringLogin();

  return (
    <AuthLayout>
      <SpringLoginForm
        state={login}
        logoSrc={loginHeader}
        logoDarkSrc={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
      />
    </AuthLayout>
  );
}
