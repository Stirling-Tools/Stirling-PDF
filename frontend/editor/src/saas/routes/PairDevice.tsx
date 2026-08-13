import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { withBasePath } from "@app/constants/app";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import {
  PairDeviceView,
  type PairPhase,
  type PendingPairing,
} from "@app/routes/PairDeviceView";
import "@app/routes/authShared/saas-auth.css";

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
 *
 * <p>Data only. {@link PairDeviceView} draws it.
 */
export default function PairDevice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();

  const [code, setCode] = useState(params.get("code") ?? "");
  const [pending, setPending] = useState<PendingPairing | null>(null);
  const [phase, setPhase] = useState<PairPhase>("entry");
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
      {/* Same header the sibling auth pages use: an admin arriving from a code on
          another screen should be able to tell at a glance they are in the right
          place, and on ours rather than somewhere that just looks like it. */}
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

      <PairDeviceView
        phase={phase}
        code={code}
        pending={pending}
        busy={busy}
        error={error}
        onCodeChange={setCode}
        onSubmitCode={() => void lookup(code)}
        onDecide={(approve) => void decide(approve)}
      />
    </AuthLayout>
  );
}
