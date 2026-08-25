import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { useTranslation } from "@app/hooks/useTranslation";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { withBasePath } from "@app/constants/app";
import {
  clearPendingConnect,
  rememberPendingConnect,
} from "@app/routes/pendingConnect";
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

/** Wider than the view renders: only PENDING is still actionable. */
interface ConnectLookup extends PendingConnect {
  status: "PENDING" | "APPROVED" | "DENIED" | "CONSUMED";
}

/** Approve a self-hosted server's request to connect to a team. */
export default function ConnectApprove() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, user, loading, signOut } = useAuth();
  const [params] = useSearchParams();
  const requestId = params.get("request");

  const [phase, setPhase] = useState<ApprovePhase>("loading");
  const [pending, setPending] = useState<PendingConnect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookedUpRef = useRef(false);

  useDocumentMeta({ title: t("connect.meta.title", "Connect a server") });

  // On arrival, not only when signed out: an approver who is already signed in can
  // still be sent away to re-authenticate, and needs the same way back.
  useEffect(() => {
    if (requestId) rememberPendingConnect(requestId);
  }, [requestId]);

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
        const res = await apiClient.get<ConnectLookup>(
          `/api/v1/account-link/connect/${encodeURIComponent(requestId)}`,
        );
        // Approving a settled request fails server-side, so offering the form again
        // would only produce a dead end.
        if (res.data.status !== "PENDING") {
          clearPendingConnect();
          setPhase(res.data.status === "DENIED" ? "declined" : "notFound");
          return;
        }
        setPending(res.data);
        setPhase("confirm");
      } catch {
        clearPendingConnect();
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
          clearPendingConnect();
          setPhase("declined");
          return;
        }
        const res = await apiClient.post<ApproveResponse>(`${path}/approve`);
        clearPendingConnect();
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

  /**
   * Sign out, then let the signed-out effect above send them to login with the request preserved.
   */
  const onSwitchAccount = useCallback(() => {
    void signOut();
  }, [signOut]);

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
        signedInEmail={user?.email ?? null}
        busy={busy}
        error={error}
        onDecide={(approve) => void onDecide(approve)}
        onSwitchAccount={onSwitchAccount}
      />
    </AuthLayout>
  );
}

/** The callback with the session appended as a fragment. */
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
