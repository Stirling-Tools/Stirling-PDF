import { useTranslation } from "react-i18next";
import { Banner, Button, Spinner } from "@app/ui";

/** Outcomes of returning from the approval page. */
export type ConnectCallbackState =
  | "working"
  | "linked"
  | "retry"
  | "expired"
  | "rejected"
  | "malformed";

export interface ConnectCallbackViewProps {
  state: ConnectCallbackState;
  /** True once the SaaS session landed, regardless of how the link itself went. */
  sessionRestored: boolean;
  onRetry: () => void;
  onDone: () => void;
}

/** Presentation for the account-link callback. */
export function ConnectCallbackView({
  state,
  sessionRestored,
  onRetry,
  onDone,
}: ConnectCallbackViewProps) {
  const { t } = useTranslation();

  if (state === "working") {
    return (
      <div className="portal-connect-callback">
        <Spinner size="md" />
        <p>
          {t(
            "portal.accountLink.connect.callback.working",
            "Finishing the connection.",
          )}
        </p>
      </div>
    );
  }

  if (state === "linked") {
    return (
      <div className="portal-connect-callback">
        <Banner
          tone="success"
          title={t(
            "portal.accountLink.connect.callback.linked.title",
            "Server connected",
          )}
        >
          {t(
            "portal.accountLink.connect.callback.linked.body",
            "This server is connected to your Stirling account.",
          )}
        </Banner>
        {/* The inverse of the failure note below: the link took but the sign-in did
            not, which otherwise only shows up later as "session expired" on a page
            that gives no hint the two are related. */}
        {sessionRestored ? null : (
          <p className="portal-connect-callback__note">
            {t(
              "portal.accountLink.connect.callback.linkedNotSignedIn",
              "You are not signed in to Stirling in this browser, so usage and billing will ask you to sign in.",
            )}
          </p>
        )}
        <Button variant="primary" onClick={onDone}>
          {t("portal.accountLink.connect.callback.continue", "Continue")}
        </Button>
      </div>
    );
  }

  const { tone, title, body, retryable } = failure(state, t);
  return (
    <div className="portal-connect-callback">
      <Banner tone={tone} title={title}>
        {body}
      </Banner>
      {/* The SaaS sign-in and the server link are separate outcomes. Say so when
          one worked and the other did not, or the admin re-runs the whole thing
          to fix a problem that is already half solved. */}
      {sessionRestored ? (
        <p className="portal-connect-callback__note">
          {t(
            "portal.accountLink.connect.callback.signedInAnyway",
            "You are signed in to Stirling, so billing and usage will load. Only the server link is incomplete.",
          )}
        </p>
      ) : null}
      <Button variant="primary" onClick={retryable ? onRetry : onDone}>
        {retryable
          ? t("portal.accountLink.connect.callback.retry", "Try again")
          : t("portal.accountLink.connect.callback.continue", "Continue")}
      </Button>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

function failure(state: ConnectCallbackState, t: Translate) {
  switch (state) {
    case "expired":
      return {
        tone: "warning" as const,
        title: t(
          "portal.accountLink.connect.callback.expired.title",
          "Request expired",
        ),
        body: t(
          "portal.accountLink.connect.callback.expired.body",
          "Connection requests are short lived. Start another one.",
        ),
        retryable: true,
      };
    case "rejected":
      return {
        tone: "warning" as const,
        title: t(
          "portal.accountLink.connect.callback.rejected.title",
          "Connection not completed",
        ),
        body: t(
          "portal.accountLink.connect.callback.rejected.body",
          "This request was declined or has already been used. Start another one if that was not intended.",
        ),
        retryable: true,
      };
    case "malformed":
      return {
        tone: "danger" as const,
        title: t(
          "portal.accountLink.connect.callback.malformed.title",
          "Could not read the response",
        ),
        body: t(
          "portal.accountLink.connect.callback.malformed.body",
          "This page was opened without a valid connection response. Start the connection from settings.",
        ),
        retryable: false,
      };
    default:
      return {
        tone: "warning" as const,
        // Not "retry.*": that key is the button label, and TOML cannot hold a
        // value and a table under the same name.
        title: t(
          "portal.accountLink.connect.callback.unfinished.title",
          "Not finished yet",
        ),
        body: t(
          "portal.accountLink.connect.callback.unfinished.body",
          "Stirling did not confirm the connection. This is usually temporary.",
        ),
        retryable: true,
      };
  }
}
