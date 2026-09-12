import { useTranslation } from "react-i18next";
import { Banner, Spinner } from "@app/ui";
import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";
import type { ConnectMode } from "@portal/auth/pendingConnect";
import "@portal/components/account-link/connect/connect.css";

/** Outcomes of returning from the approval page. */
export type ConnectCallbackState =
  | "working"
  | "linked"
  | "retry"
  | "expired"
  | "rejected"
  | "malformed";

export interface ConnectOutcome {
  mode?: ConnectMode;
  settingsSection?: string | null;
  state: ConnectCallbackState;
  /** True only after the server accepts the callback and the SDK installs its session. */
  sessionRestored: boolean;
  /** Retries the uncompleted phase without repeating a claim already accepted by the server. */
  reclaim?: () => void;
  /** Discards an unfinished callback when its dialog is dismissed. */
  cancel?: () => void;
}

export function isRetryableOutcome(state: ConnectCallbackState): boolean {
  return state !== "linked" && state !== "malformed";
}

export interface ConnectCallbackViewProps {
  mode?: ConnectMode;
  state: ConnectCallbackState;
  sessionRestored: boolean;
  onDone: () => void;
}

/**
 * Five states in one step: a failed link is still step 3 of the flow they started, and a separate
 * error dialog would discard the progress bar that says where they are. Actions live in the
 * dialog's footer, not here, so they stay where steps 1 and 2 put them.
 */
export function ConnectCallbackView({
  mode = "link",
  state,
  sessionRestored,
  onDone,
}: ConnectCallbackViewProps) {
  const { t } = useTranslation();

  if (state === "working") {
    return (
      <div className="portal-connect-callback portal-connect-callback--working">
        <Spinner size="md" />
        <p>
          {mode === "reauth"
            ? t(
                "portal.accountLink.renewal.working",
                "Restoring billing access.",
              )
            : t(
                "portal.accountLink.connect.callback.working",
                "Finishing the connection.",
              )}
        </p>
      </div>
    );
  }

  if (state === "linked") {
    if (mode === "reauth") {
      return (
        <p className="portal-connect__lede">
          {sessionRestored
            ? t(
                "portal.accountLink.renewal.success",
                "Your billing access has been renewed. This server is still connected to the same Stirling account.",
              )
            : t(
                "portal.accountLink.renewal.incomplete",
                "This server is still connected, but we could not restore billing access in this browser. Try signing in again.",
              )}
        </p>
      );
    }
    return (
      <div className="portal-connect-callback">
        <p className="portal-connect__lede">
          {t(
            "portal.accountLink.connect.done.lede",
            "This server now runs against your Stirling account.",
          )}
        </p>
        {/* Link took, sign-in did not: otherwise this resurfaces later as "session expired" with
            nothing tying it back here. */}
        {sessionRestored ? null : (
          <p className="portal-connect-callback__note">
            {t(
              "portal.accountLink.connect.callback.linkedNotSignedIn",
              "You are not signed in to Stirling in this browser, so usage and billing will ask you to sign in.",
            )}
          </p>
        )}
        <ConnectDoneSlide onNavigate={onDone} />
      </div>
    );
  }

  const { tone, title, body } = failure(state, t, mode === "reauth");
  return (
    <div className="portal-connect-callback">
      <Banner tone={tone} title={title}>
        {body}
      </Banner>
      {/* Two separate outcomes: without this the admin re-runs the lot to fix a half-solved
          problem. */}
      {sessionRestored ? (
        <p className="portal-connect-callback__note">
          {t(
            "portal.accountLink.connect.callback.signedInAnyway",
            "You are signed in to Stirling, so billing and usage will load. Only the server link is incomplete.",
          )}
        </p>
      ) : null}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

function failure(state: ConnectCallbackState, t: Translate, reauth: boolean) {
  if (reauth) {
    const messages = {
      expired: t(
        "portal.accountLink.renewal.expired",
        "This sign-in request expired. Try again to renew billing access; your server is still connected.",
      ),
      rejected: t(
        "portal.accountLink.renewal.rejected",
        "This sign-in request was declined or has already been used. Try again to renew billing access.",
      ),
      malformed: t(
        "portal.accountLink.renewal.malformed",
        "We could not verify this sign-in response. Start again from Usage & billing; your server is still connected.",
      ),
      retry: t(
        "portal.accountLink.renewal.retry",
        "Stirling could not finish renewing billing access. Try again in a moment; your server is still connected.",
      ),
    };
    return {
      tone: "warning" as const,
      title: t("portal.accountLink.renewal.title", "Renew billing access"),
      body: messages[state as keyof typeof messages] ?? messages.retry,
    };
  }
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
      };
  }
}
