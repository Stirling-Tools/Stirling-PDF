import { useTranslation } from "react-i18next";
import { Spinner } from "@app/ui/Spinner";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import { withBasePath } from "@app/constants/app";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";

/** Shown while a fresh server signs its first admin in with the default login. */
export function DefaultSignInScreen() {
  const { t } = useTranslation();
  const message = t(
    "login.signingInWithDefaults",
    "Signing in with default credentials",
  );
  return (
    <AuthLayout>
      <div className="auth-logo-block">
        <img
          src={loginHeader}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--light"
        />
        <img
          src={withBasePath("/modern-logo/LoginDarkModeHeader.svg")}
          alt="Stirling PDF"
          className="auth-logo-header auth-logo-header--dark"
        />
      </div>
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          marginTop: "2rem",
          color: "var(--c-text-muted)",
        }}
      >
        <Spinner size="sm" />
        <span>{message}</span>
      </div>
    </AuthLayout>
  );
}
