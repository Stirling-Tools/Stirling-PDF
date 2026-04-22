import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAccountLogout } from "@app/extensions/accountLogout";
import LocalIcon from "@app/components/shared/LocalIcon";
import QuickAccessButton from "@app/components/shared/quickAccessBar/QuickAccessButton";

export function LoginLogoutButton() {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { user, loading, signOut } = useAuth();
  const accountLogout = useAccountLogout();
  const loginUrl = new URL("login", document.baseURI).toString();

  const redirectToLogin = useCallback(() => {
    window.location.assign(loginUrl);
  }, [loginUrl]);

  const handleLogout = useCallback(async () => {
    await accountLogout({ signOut, redirectToLogin });
  }, [accountLogout, signOut, redirectToLogin]);

  const handleLogin = useCallback(() => {
    window.location.assign(loginUrl);
  }, [loginUrl]);

  // Only show when login is enabled
  if (config?.enableLogin !== true) return null;

  // Avoid flash while session is being determined
  if (loading) return null;

  if (user) {
    return (
      <QuickAccessButton
        icon={<LocalIcon icon="logout-rounded" width="1.25rem" height="1.25rem" />}
        label={t("quickAccess.logout", "Logout")}
        isActive={false}
        onClick={handleLogout}
        ariaLabel={t("quickAccess.logout", "Logout")}
        dataTestId="logout-button"
      />
    );
  }

  return (
    <QuickAccessButton
      icon={<LocalIcon icon="login-rounded" width="1.25rem" height="1.25rem" />}
      label={t("quickAccess.login", "Login")}
      isActive={false}
      onClick={handleLogin}
      ariaLabel={t("quickAccess.login", "Login")}
      dataTestId="login-button"
    />
  );
}
