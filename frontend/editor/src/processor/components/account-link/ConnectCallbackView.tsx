import { useTranslation } from "react-i18next";
import { Banner, Spinner } from "@app/ui";
import { ConnectDoneSlide } from "@processor/components/account-link/connect/ConnectDoneSlide";
import "@processor/components/account-link/connect/connect.css";

/** Outcomes of returning from the approval page. */
export type ConnectCallbackState =
  | "working"
  | "linked"
  | "retry"
  | "expired"
  | "rejected"
  | "malformed";

export interface ConnectOutcome {
  state: ConnectCallbackState;
  /** True once the SaaS session landed, regardless of how the link itself went. */
  sessionRestored: boolean;
  /** Present only while the handshake is still open, so a retry re-claims rather than opening one. */
  reclaim?: () => void;
}

export function isRetryableOutcome(state: ConnectCallbackState): boolean {
  return state !== "linked" && state !== "malformed";
}

export interface ConnectCallbackViewProps {
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
  state,
  sessionRestored,
  onDone,
}: ConnectCallbackViewProps) {
  const { t } = useTranslation();

  if (state === "working") {
    return (
      <div className="processor-connect-callback processor-connect-callback--working">
        <Spinner size="md" />
        <p>
          {t(
            "processor.accountLink.connect.callback.working",
            "Finishing the connection.",
          )}
        </p>
      </div>
    );
  }

  if (state === "linked") {
    return (
      <div className="processor-connect-callback">
        <p className="processor-connect__lede">
          {t(
            "processor.accountLink.connect.done.lede",
            "This server now runs against your Stirling account.",
          )}
        </p>
        {/* Link took, sign-in did not: otherwise this resurfaces later as "session expired" with
            nothing tying it back here. */}
        {sessionRestored ? null : (
          <p className="processor-connect-callback__note">
            {t(
              "processor.accountLink.connect.callback.linkedNotSignedIn",
              "You are not signed in to Stirling in this browser, so usage and billing will ask you to sign in.",
            )}
          </p>
        )}
        <ConnectDoneSlide onNavigate={onDone} />
      </div>
    );
  }

  const { tone, title, body } = failure(state, t);
  return (
    <div className="processor-connect-callback">
      <Banner tone={tone} title={title}>
        {body}
      </Banner>
      {/* Two separate outcomes: without this the admin re-runs the lot to fix a half-solved
          problem. */}
      {sessionRestored ? (
        <p className="processor-connect-callback__note">
          {t(
            "processor.accountLink.connect.callback.signedInAnyway",
            "You are signed in to Stirling, so billing and usage will load. Only the server link is incomplete.",
          )}
        </p>
      ) : null}
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
          "processor.accountLink.connect.callback.expired.title",
          "Request expired",
        ),
        body: t(
          "processor.accountLink.connect.callback.expired.body",
          "Connection requests are short lived. Start another one.",
        ),
      };
    case "rejected":
      return {
        tone: "warning" as const,
        title: t(
          "processor.accountLink.connect.callback.rejected.title",
          "Connection not completed",
        ),
        body: t(
          "processor.accountLink.connect.callback.rejected.body",
          "This request was declined or has already been used. Start another one if that was not intended.",
        ),
      };
    case "malformed":
      return {
        tone: "danger" as const,
        title: t(
          "processor.accountLink.connect.callback.malformed.title",
          "Could not read the response",
        ),
        body: t(
          "processor.accountLink.connect.callback.malformed.body",
          "This page was opened without a valid connection response. Start the connection from settings.",
        ),
      };
    default:
      return {
        tone: "warning" as const,
        // Not "retry.*": that key is the button label, and TOML cannot hold a
        // value and a table under the same name.
        title: t(
          "processor.accountLink.connect.callback.unfinished.title",
          "Not finished yet",
        ),
        body: t(
          "processor.accountLink.connect.callback.unfinished.body",
          "Stirling did not confirm the connection. This is usually temporary.",
        ),
      };
  }
}
