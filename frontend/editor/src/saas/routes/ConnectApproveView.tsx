import { useState, type ReactNode } from "react";
import { useTranslation } from "@app/hooks/useTranslation";
import { Banner, Button, Checkbox, Spinner } from "@app/ui";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { StepModalHeader } from "@app/portal/components/shared/StepModalHeader";

/**
 * This page is step 2 of a flow that started on the instance, so it wears the same chrome: the admin
 * is being asked for a security decision by what would otherwise look like a different product.
 */
const TOTAL_STEPS = 3;

function ApproveShell({
  title,
  stepped,
  children,
}: {
  title: string;
  /** Re-auth is one step on the instance side, so counting to three here would describe nothing. */
  stepped: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="saas-connect">
      <StepModalHeader
        brand
        title={title}
        step={stepped ? 2 : undefined}
        total={stepped ? TOTAL_STEPS : undefined}
        stepLabel={
          stepped
            ? t("connect.step", "Step {{current}} of {{total}}", {
                current: 2,
                total: TOTAL_STEPS,
              })
            : undefined
        }
      />
      {children}
    </div>
  );
}

export type ApprovePhase =
  | "loading"
  | "confirm"
  | "redirecting"
  | "declined"
  | "notFound";

/** What the approver is being asked to connect. */
export interface PendingConnect {
  requestId: string;
  callbackOrigin: string;
  insecureTransport: boolean;
  /** REAUTH can only confirm the original account and team authenticated by the device credential. */
  mode?: "LINK" | "REAUTH";
  canApprove: boolean;
  canDeny: boolean;
}

export interface ConnectApproveViewProps {
  phase: ApprovePhase;
  pending: PendingConnect | null;
  /** Email of the current signed-in account; never another account's email. */
  signedInEmail: string | null;
  busy: boolean;
  error: string | null;
  onDecide: (approve: boolean) => void;
  /** Sign out and come back here, keeping the request so it survives the detour. */
  onSwitchAccount: () => void;
  /** Forget the local intent and return to the app without settling the server request. */
  onDismiss: () => void;
}

/** Presentation for the connect approval page. */
export function ConnectApproveView({
  phase,
  pending,
  signedInEmail,
  busy,
  error,
  onDecide,
  onSwitchAccount,
  onDismiss,
}: ConnectApproveViewProps) {
  const { t } = useTranslation();
  // Gates the primary action: anyone can create a request, so the approver reading
  // the address is the only thing between one and a linked team.
  const [acknowledged, setAcknowledged] = useState(false);
  const renewal = pending?.mode === "REAUTH";
  const stepped = !renewal;

  if (phase === "loading" || phase === "redirecting") {
    return (
      <ApproveShell
        stepped={stepped}
        title={
          phase === "redirecting"
            ? t("connect.redirecting", "Returning you to your server.")
            : t("connect.loading", "Checking this request.")
        }
      >
        <div className="saas-connect__waiting">
          <Spinner size="md" />
        </div>
      </ApproveShell>
    );
  }

  if (phase === "notFound") {
    return (
      <ApproveShell
        stepped={stepped}
        title={t("connect.notFound.title", "Request not valid")}
      >
        <Banner
          tone="danger"
          title={t("connect.notFound.title", "Request not valid")}
        >
          {t(
            "connect.notFound.body",
            "This connection request is not valid. It may have expired, or already been used. Start another one from your server.",
          )}
        </Banner>
      </ApproveShell>
    );
  }

  if (phase === "declined") {
    return (
      <ApproveShell
        stepped={stepped}
        title={t("connect.declined.title", "Request declined")}
      >
        <Banner
          tone="warning"
          title={t("connect.declined.title", "Request declined")}
        >
          {t(
            "connect.declined.body",
            "Nothing was connected. You can close this page.",
          )}
        </Banner>
      </ApproveShell>
    );
  }

  return (
    <ApproveShell
      stepped={stepped}
      title={
        renewal
          ? t("connect.renewal.title", "Renew your server sign-in")
          : t("connect.confirm.title", "Connect this server?")
      }
    >
      <p className="saas-connect__lead">
        {renewal
          ? pending?.canApprove
            ? t(
                "connect.renewal.lead",
                "This server is already linked to your account. Renew your sign-in to return to billing and usage on your server.",
              )
            : t(
                "connect.renewal.wrongAccount",
                "This account cannot renew this server's sign-in. Switch to the account originally used to link the server. That account must still own the linked team.",
              )
          : pending?.canApprove
            ? t(
                "connect.confirm.lead",
                "A Stirling server is asking to connect to your team. Check the address below is yours before you approve.",
              )
            : t(
                "connect.confirm.cannotDecide",
                "Only a team owner can approve or decline this connection. Use a different account or dismiss this prompt to continue using Stirling.",
              )}
      </p>

      {/* One panel, because the account and the address are two halves of the same
          decision: right server, wrong account is still wrong. */}
      <dl className="saas-connect__facts">
        <dt>{t("connect.confirm.signedInAs", "Account")}</dt>
        <dd>
          {signedInEmail ??
            t("connect.confirm.unknownAccount", "an unknown account")}
          <button
            type="button"
            className="saas-connect__switch"
            disabled={busy}
            onClick={onSwitchAccount}
          >
            {t("connect.confirm.switchAccount", "Use a different account")}
          </button>
        </dd>
        {/* The reported name is deliberately not shown. The requester chooses it on an
            unauthenticated endpoint, so it is the field an attacker would set to look
            familiar, and its honest value is the hostname already in the address. It
            still labels the server in the linked-instances list, after the decision. */}
        <dt className="saas-connect__origin-label">
          {t("connect.confirm.originLabel", "Address")}
          {pending?.insecureTransport ? (
            <Tooltip
              position="top"
              content={t(
                "connect.confirm.insecure.body",
                "This address does not use HTTPS, so your sign-in will be sent over an unencrypted connection. Only approve it on a network you trust.",
              )}
            >
              <span
                className="saas-connect__insecure"
                tabIndex={0}
                role="img"
                aria-label={t(
                  "connect.confirm.insecure.label",
                  "Not an encrypted address",
                )}
              >
                <LocalIcon icon="warning-rounded" width="1rem" />
              </span>
            </Tooltip>
          ) : null}
        </dt>
        <dd className="saas-connect__origin">{pending?.callbackOrigin}</dd>
      </dl>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {pending?.canApprove && !renewal ? (
        <Checkbox
          checked={acknowledged}
          disabled={busy}
          onChange={(e) => setAcknowledged(e.currentTarget.checked)}
          label={t(
            "connect.confirm.acknowledge",
            "I recognise this address and want to connect it to my team",
          )}
        />
      ) : null}

      <div className="saas-connect__actions">
        {pending?.canDeny && !renewal ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onDecide(false)}
          >
            {t("connect.confirm.deny", "Decline")}
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={onDismiss}>
            {t("connect.confirm.dismiss", "Dismiss")}
          </Button>
        )}
        {pending?.canApprove ? (
          <Button
            variant="primary"
            disabled={busy || (!renewal && !acknowledged)}
            onClick={() => onDecide(true)}
          >
            {renewal
              ? t("connect.renewal.approve", "Renew sign-in")
              : t("connect.confirm.approve", "Connect server")}
          </Button>
        ) : null}
      </div>
    </ApproveShell>
  );
}
