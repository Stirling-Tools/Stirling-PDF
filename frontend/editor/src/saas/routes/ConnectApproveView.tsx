import { useState, type ReactNode } from "react";
import { useTranslation } from "@app/hooks/useTranslation";
import { Banner, Button, Checkbox, Spinner } from "@app/ui";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { StepModalHeader } from "@processor/components/shared/StepModalHeader";

/**
 * This page is step 2 of a flow that started on the instance, so it wears the same chrome: the admin
 * is being asked for a security decision by what would otherwise look like a different product.
 *
 * <p>TODO: re-auth still wears the first link's copy and consent checkbox, which asks the approver
 * to agree to a binding that already exists.
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
      {/* No onClose: this is a page, so there is nowhere to close back to. */}
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
  /** REAUTH cannot rebind: the team is pinned from the device credential at request time. */
  mode?: "LINK" | "REAUTH";
}

export interface ConnectApproveViewProps {
  phase: ApprovePhase;
  pending: PendingConnect | null;
  /** Email of the account the server would be connected to. */
  signedInEmail: string | null;
  busy: boolean;
  error: string | null;
  onDecide: (approve: boolean) => void;
  /** Sign out and come back here, keeping the request so it survives the detour. */
  onSwitchAccount: () => void;
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
}: ConnectApproveViewProps) {
  const { t } = useTranslation();
  // Gates the primary action: anyone can create a request, so the approver reading
  // the address is the only thing between one and a linked team.
  const [acknowledged, setAcknowledged] = useState(false);
  const stepped = pending?.mode !== "REAUTH";

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
      title={t("connect.confirm.title", "Connect this server?")}
    >
      <p className="saas-connect__lead">
        {t(
          "connect.confirm.lead",
          "A Stirling server is asking to connect to your team. Check the address below is yours before you approve.",
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

      <Checkbox
        checked={acknowledged}
        disabled={busy}
        onChange={(e) => setAcknowledged(e.currentTarget.checked)}
        label={t(
          "connect.confirm.acknowledge",
          "I recognise this address and want to connect it to my team",
        )}
      />

      <div className="saas-connect__actions">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onDecide(false)}
        >
          {t("connect.confirm.deny", "Decline")}
        </Button>
        <Button
          variant="primary"
          disabled={busy || !acknowledged}
          onClick={() => onDecide(true)}
        >
          {t("connect.confirm.approve", "Connect server")}
        </Button>
      </div>
    </ApproveShell>
  );
}
