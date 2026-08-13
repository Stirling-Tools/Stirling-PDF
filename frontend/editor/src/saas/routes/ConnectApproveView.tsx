import { useTranslation } from "@app/hooks/useTranslation";
import { Banner, Button, Spinner } from "@app/ui";

export type ApprovePhase =
  | "loading"
  | "confirm"
  | "redirecting"
  | "declined"
  | "notFound";

/** What the approver is being asked to connect. Carries no secret. */
export interface PendingConnect {
  requestId: string;
  name: string | null;
  callbackOrigin: string;
  insecureTransport: boolean;
}

export interface ConnectApproveViewProps {
  phase: ApprovePhase;
  pending: PendingConnect | null;
  busy: boolean;
  error: string | null;
  onDecide: (approve: boolean) => void;
}

/**
 * Presentation for the connect approval page. Pure, so every state is reachable
 * from props without a handshake, a session or a redirect.
 *
 * <p>The origin is the security control on this screen, not decoration. It is
 * where a live session token will be sent, and the approver is the only party
 * who can tell whether it is really their server. That is why it is rendered
 * prominently, and why plaintext transport is called out rather than hidden.
 */
export function ConnectApproveView({
  phase,
  pending,
  busy,
  error,
  onDecide,
}: ConnectApproveViewProps) {
  const { t } = useTranslation();

  if (phase === "loading" || phase === "redirecting") {
    return (
      <div className="saas-connect">
        <Spinner size="md" />
        <p className="saas-connect__lead">
          {phase === "redirecting"
            ? t("connect.redirecting", "Returning you to your server.")
            : t("connect.loading", "Checking this request.")}
        </p>
      </div>
    );
  }

  if (phase === "notFound") {
    return (
      <div className="saas-connect">
        <Banner
          tone="danger"
          title={t("connect.notFound.title", "Request not valid")}
        >
          {t(
            "connect.notFound.body",
            "This connection request is not valid. It may have expired, or already been used. Start another one from your server.",
          )}
        </Banner>
      </div>
    );
  }

  if (phase === "declined") {
    return (
      <div className="saas-connect">
        <Banner
          tone="warning"
          title={t("connect.declined.title", "Request declined")}
        >
          {t(
            "connect.declined.body",
            "Nothing was connected. You can close this page.",
          )}
        </Banner>
      </div>
    );
  }

  return (
    <div className="saas-connect">
      <h1 className="saas-connect__title">
        {t("connect.confirm.title", "Connect this server?")}
      </h1>
      <p className="saas-connect__lead">
        {t(
          "connect.confirm.lead",
          "A Stirling server is asking to connect to your team. Check the address below is yours before you approve.",
        )}
      </p>

      <dl className="saas-connect__facts">
        {pending?.name ? (
          <>
            <dt>{t("connect.confirm.nameLabel", "Name it reported")}</dt>
            <dd>{pending.name}</dd>
          </>
        ) : null}
        <dt>{t("connect.confirm.originLabel", "Address")}</dt>
        <dd className="saas-connect__origin">{pending?.callbackOrigin}</dd>
      </dl>

      {pending?.insecureTransport ? (
        <Banner
          tone="warning"
          title={t(
            "connect.confirm.insecure.title",
            "Not an encrypted address",
          )}
        >
          {t(
            "connect.confirm.insecure.body",
            "This address does not use HTTPS, so your sign-in will be sent over an unencrypted connection. Only approve it on a network you trust.",
          )}
        </Banner>
      ) : null}

      <p className="saas-connect__warning">
        {t(
          "connect.confirm.consequence",
          "Approving signs you in on that server and lets it use your team's plan. Do not approve an address you do not recognise.",
        )}
      </p>

      {error ? <Banner tone="danger">{error}</Banner> : null}

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
          disabled={busy}
          onClick={() => onDecide(true)}
        >
          {t("connect.confirm.approve", "Connect server")}
        </Button>
      </div>
    </div>
  );
}
