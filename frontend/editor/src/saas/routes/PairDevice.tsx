import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { withBasePath } from "@app/constants/app";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import { Button } from "@app/ui/Button";
import "@app/auth/ui/auth.css";
import "@app/routes/authShared/saas-auth.css";
import "@app/routes/PairDevice.css";

/** Shape of GET /api/v1/pair/lookup. All display-only, and all instance-supplied. */
interface PendingPairing {
  userCode: string;
  name: string | null;
  version: string | null;
  address: string | null;
  requestedAt: string | null;
  expiresAt: string | null;
}

type Phase = "entry" | "confirm" | "done" | "declined";

/**
 * Approve a self-hosted server's pairing request (device grant, RFC 8628).
 *
 * <p>This page exists because a self-hosted instance cannot complete an identity
 * round trip on its own origin: the provider will only redirect to allow-listed
 * URLs, and a customer's hostname can never be on that list. Doing the human half
 * here, on an origin we control, is what lets SSO and sign-up work at all, and it
 * covers headless servers that have no browser.
 *
 * <p>The confirmation step is the security control, not a formality. Device grants
 * are phishable: an attacker can start a pairing on their own server and talk
 * someone into approving the code. So we show what is actually being paired and
 * let the approver walk away.
 */
export default function PairDevice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();

  const [code, setCode] = useState(params.get("code") ?? "");
  const [pending, setPending] = useState<PendingPairing | null>(null);
  const [phase, setPhase] = useState<Phase>("entry");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: t("pair.meta.title", "Pair a server"),
  });

  // Signed-out visitors are sent to log in and returned here with the code
  // preserved, so a code pasted from a server survives the detour.
  useEffect(() => {
    if (loading || session) return;
    const next = `/link${code ? `?code=${encodeURIComponent(code)}` : ""}`;
    navigate(`/login?next=${encodeURIComponent(withBasePath(next))}`, {
      replace: true,
    });
  }, [loading, session, code, navigate]);

  const lookup = useCallback(
    async (typed: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await apiClient.get<PendingPairing>("/api/v1/pair/lookup", {
          params: { code: typed },
        });
        setPending(res.data);
        setPhase("confirm");
      } catch {
        // 404 covers unknown, expired and already-settled codes alike. Telling
        // them apart would help someone probing for live codes more than it
        // would help the admin.
        setError(
          t(
            "pair.error.notFound",
            "That code is not valid. It may have expired, or already been used. Ask the server for a new one.",
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const decide = useCallback(
    async (approve: boolean) => {
      if (!pending) return;
      setBusy(true);
      setError(null);
      try {
        await apiClient.post(
          approve ? "/api/v1/pair/approve" : "/api/v1/pair/deny",
          approve
            ? { code: pending.userCode, name: pending.name }
            : { code: pending.userCode },
        );
        setPhase(approve ? "done" : "declined");
      } catch {
        setError(
          t(
            "pair.error.failed",
            "That did not go through. Only a team owner can pair a server.",
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [pending, t],
  );

  if (loading || !session) return null;

  return (
    <AuthLayout>
      <div className="pair-device">
        {phase === "entry" && (
          <>
            <h1 className="pair-device__title">
              {t("pair.entry.title", "Enter your pairing code")}
            </h1>
            <p className="pair-device__sub">
              {t(
                "pair.entry.sub",
                "From the screen on the server you are connecting.",
              )}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lookup(code);
              }}
            >
              <label className="pair-device__label" htmlFor="pair-code">
                {t("pair.entry.label", "Pairing code")}
              </label>
              <input
                id="pair-code"
                className="pair-device__input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="WXYZ-4821"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby={error ? "pair-error" : undefined}
              />
              {error && (
                <div id="pair-error">
                  <ErrorMessage error={error} />
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={busy || code.trim().length === 0}
              >
                {t("pair.entry.submit", "Continue")}
              </Button>
            </form>
          </>
        )}

        {phase === "confirm" && pending && (
          <>
            <h1 className="pair-device__title">
              {t("pair.confirm.title", "Pair this server?")}
            </h1>
            <p className="pair-device__sub">
              {t(
                "pair.confirm.sub",
                "Check these details match the server you are connecting. If they do not, decline.",
              )}
            </p>
            <dl className="pair-device__facts">
              <dt>{t("pair.confirm.name", "Name")}</dt>
              <dd>{pending.name ?? t("pair.confirm.unnamed", "Not set")}</dd>
              <dt>{t("pair.confirm.address", "Address")}</dt>
              <dd>{pending.address ?? t("pair.confirm.unknown", "Unknown")}</dd>
              <dt>{t("pair.confirm.version", "Version")}</dt>
              <dd>{pending.version ?? t("pair.confirm.unknown", "Unknown")}</dd>
              <dt>{t("pair.confirm.code", "Code")}</dt>
              <dd>{pending.userCode}</dd>
            </dl>
            {error && <ErrorMessage error={error} />}
            <div className="pair-device__actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void decide(false)}
              >
                {t("pair.confirm.decline", "Decline")}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void decide(true)}
              >
                {t("pair.confirm.approve", "Pair server")}
              </Button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <h1 className="pair-device__title">
              {t("pair.done.title", "Server paired")}
            </h1>
            <p className="pair-device__sub">
              {t(
                "pair.done.sub",
                "You can close this page. The server picks up the connection within a few seconds.",
              )}
            </p>
          </>
        )}

        {phase === "declined" && (
          <>
            <h1 className="pair-device__title">
              {t("pair.declined.title", "Pairing declined")}
            </h1>
            <p className="pair-device__sub">
              {t(
                "pair.declined.sub",
                "Nothing was connected. If you did not expect this code, someone may have sent it to you by mistake.",
              )}
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
