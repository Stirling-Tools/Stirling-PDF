import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RequireProcessorAccess } from "@app/auth";
import { Spinner } from "@app/ui";
import { LoginScreen } from "@processor/components/LoginScreen";
import { EDITOR_URL } from "@processor/auth/editorUrl";

// Stable module-level ref; RequireProcessorAccess calls it from an effect.
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

/** Gates the processor: login when signed out, redirect to the editor without processor access. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <RequireProcessorAccess
      fallback={<LoginScreen />}
      onForbidden={redirectToEditor}
      loading={
        <FullScreenMessage>
          <Spinner size="lg" label={t("processor.auth.loading", "Loading")} />
        </FullScreenMessage>
      }
      forbidden={
        <FullScreenMessage>
          {t(
            "processor.auth.redirectingToEditor",
            "Redirecting to the editor...",
          )}
        </FullScreenMessage>
      }
    >
      {children}
    </RequireProcessorAccess>
  );
}
