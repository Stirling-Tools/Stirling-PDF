import type { ReactNode } from "react";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import { withBasePath } from "@app/constants/app";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import "@app/auth/ui/auth.css";

/** The sign-in card with the Stirling logo, shared by the OAuth authorize and consent pages. */
export function OAuthPageShell({ children }: { children: ReactNode }) {
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
      {children}
    </AuthLayout>
  );
}
