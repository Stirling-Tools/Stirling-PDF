import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RequireAdmin } from "@shared/auth";
import { Spinner } from "@shared/components";
import { LoginScreen } from "@portal/components/LoginScreen";
import { EDITOR_URL } from "@portal/auth/editorUrl";

/**
 * Module-level so the reference is stable across renders (RequireAdmin runs it
 * from an effect). The portal is admin-only today; authenticated non-admins are
 * bounced to the editor rather than shown an access-denied page.
 */
function redirectToEditor(): void {
  window.location.href = EDITOR_URL;
}

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        color: "var(--color-text-3)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Gates the whole portal behind an authenticated admin session:
 * - loading -> spinner
 * - signed out -> login screen
 * - signed in, not admin -> redirect to the editor
 * - signed in admin -> the portal
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <RequireAdmin
      fallback={<LoginScreen />}
      onForbidden={redirectToEditor}
      loading={
        <FullScreenMessage>
          <Spinner size="lg" label={t("auth.loading", "Loading")} />
        </FullScreenMessage>
      }
      forbidden={
        <FullScreenMessage>
          {t("auth.redirectingToEditor", "Redirecting to the editor...")}
        </FullScreenMessage>
      }
    >
      {children}
    </RequireAdmin>
  );
}
