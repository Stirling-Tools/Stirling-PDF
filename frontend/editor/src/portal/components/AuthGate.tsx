import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RequirePortalAccess } from "@app/auth";
import { Spinner } from "@app/ui";
import { LoginScreen } from "@portal/components/LoginScreen";
import { EDITOR_URL } from "@portal/auth/editorUrl";

// Stable module-level ref; RequirePortalAccess calls it from an effect.
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
        color: "var(--c-text-subtle)",
      }}
    >
      {children}
    </div>
  );
}

/** Gates the portal: login when signed out, redirect to the editor without portal access. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <RequirePortalAccess
      fallback={<LoginScreen />}
      onForbidden={redirectToEditor}
      loading={
        <FullScreenMessage>
          <Spinner size="lg" label={t("portal.auth.loading", "Loading")} />
        </FullScreenMessage>
      }
      forbidden={
        <FullScreenMessage>
          {t("portal.auth.redirectingToEditor", "Redirecting to the editor...")}
        </FullScreenMessage>
      }
    >
      {children}
    </RequirePortalAccess>
  );
}
