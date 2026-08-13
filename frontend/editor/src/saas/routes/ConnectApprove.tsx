import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { withBasePath } from "@app/constants/app";
import loginHeader from "@app/assets/brand/modern-logo/LoginLightModeHeader.svg";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import {
  ConnectApproveView,
  type ApprovePhase,
  type PendingConnect,
} from "@app/routes/ConnectApproveView";
import "@app/routes/authShared/saas-auth.css";
import "@app/routes/connect.css";

interface ApproveResponse {
  callbackUrl: string;
  nonce: string;
}

/**
 * Approve a self-hosted server's request to connect to a team.
 *
 * <p>This page exists because a self-hosted instance cannot complete an identity
 * round trip on its own origin: the provider only redirects to allow-listed
 * URLs, and a customer's hostname can never be on that list. Doing the human
 * half here, on an origin we control, is what lets SSO and sign-up work for
 * self-hosted linking at all.
 *
 * <p>On approval this page performs the redirect the desktop app gets from the
 * OS: it sends the admin back to their server carrying the session in the URL
 * fragment. Two things make that safe rather than an open redirect. The
 * destination comes from the backend, which read it from the stored request
 * rather than from anything in this page's URL. And the approver was shown the
 * origin first, which is the only check that can tell "my server" from
 * "someone else's".
 *
 * <p>Data only. {@link ConnectApproveView} draws it.
 */
export default function ConnectApprove() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const requestId = params.get("request");

  const [phase, setPhase] = useState<ApprovePhase>("loading");
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookedUpRef = useRef(false);

  useDocumentMeta({ title: t("connect.meta.title", "Connect a server") });

  // Signed-out visitors sign in and come back here with the request preserved,
  // which is also the point at which SSO and sign-up become available to a
  // self-hosted admin.
  useEffect(() => {
    if (loading || session) return;
    const next = `/link${requestId ? `?request=${encodeURIComponent(requestId)}` : ""}`;
    navigate(`/login?next=${encodeURIComponent(withBasePath(next))}`, {
      replace: true,
    });
  }, [loading, session, requestId, navigate]);

  useEffect(() => {
    if (loading || !session || lookedUpRef.current) return;
    lookedUpRef.current = true;
    if (!requestId) {
      setPhase("notFound");
      return;
    }
    void (async () => {
      try {
        const res = await apiClient.get<PendingConnect>(
          `/api/v1/account-link/connect/${encodeURIComponent(requestId)}`,
        );
        setPending(res.data);
        setPhase("confirm");
      } catch {
        // Unknown, expired and already-settled all look the same on purpose:
        // telling them apart would help someone probing ids more than it helps
        // the admin.
        setPhase("notFound");
      }
    })();
  }, [loading, session, requestId]);

  const onDecide = useCallback(
    async (approve: boolean) => {
      if (!requestId) return;
      setBusy(true);
      setError(null);
      const path = `/api/v1/account-link/connect/${encodeURIComponent(requestId)}`;
      try {
        if (!approve) {
          await apiClient.post(`${path}/deny`);
          setPhase("declined");
          return;
        }
        const res = await apiClient.post<ApproveResponse>(`${path}/approve`);
        setPhase("redirecting");
        window.location.replace(returnUrl(res.data, session));
      } catch {
        setError(
          t(
            "connect.error.failed",
            "That did not go through. Only a team owner can connect a server.",
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [requestId, session, t],
  );

  if (loading || !session) return null;

  return (
    <AuthLayout>
      {/* Same header as the sibling auth pages: an admin arriving from another
          screen should be able to tell at a glance they are on our site and not
          somewhere that merely looks like it. */}
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

      <ConnectApproveView
        phase={phase}
        pending={pending}
        busy={busy}
        error={error}
        onDecide={(approve) => void onDecide(approve)}
      />
    </AuthLayout>
  );
}

/**
 * The callback with the session appended as a fragment.
 *
 * <p>A fragment rather than a query string so the token never reaches the
 * server: it stays out of access logs and out of the {@code Referer} header.
 * Built from the backend-supplied callback, so this function cannot be steered
 * at a different origin by anything in the page's own URL.
 */
function returnUrl(
  approval: ApproveResponse,
  session: { access_token?: string; refresh_token?: string } | null,
): string {
  const fragment = new URLSearchParams({ type: "link", nonce: approval.nonce });
  if (session?.access_token && session?.refresh_token) {
    fragment.set("access_token", session.access_token);
    fragment.set("refresh_token", session.refresh_token);
  }
  return `${approval.callbackUrl}#${fragment.toString()}`;
}
