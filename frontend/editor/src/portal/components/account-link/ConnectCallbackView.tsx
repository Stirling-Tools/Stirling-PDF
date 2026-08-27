import { useTranslation } from "react-i18next";
import { Banner, Spinner } from "@app/ui";
import { ConnectDoneSlide } from "@portal/components/account-link/connect/ConnectDoneSlide";
import "@portal/components/account-link/connect/connect.css";

/** Outcomes of returning from the approval page. */
export type ConnectCallbackState =
  | "working"
  | "linked"
  | "retry"
  | "expired"
  | "rejected"
  | "malformed";

/** A finished round trip to Stirling, as the dialog needs to render it. */
export interface ConnectOutcome {
  state: ConnectCallbackState;
  /** True once the SaaS session landed, regardless of how the link itself went. */
  sessionRestored: boolean;
  /**
   * Claims the same handshake again, when it is still open (the approval landed but the claim did
   * not). Absent when the handshake is spent, where the only way on is a new one: a leader had to
   * approve this server by hand, so re-claiming beats spending that approval again.
   */
  reclaim?: () => void;
}

/**
 * Whether the handshake can be picked back up, which decides what the dialog's footer offers.
 *
 * <p>Everything except a malformed response is worth another go: the row is still on the instance,
 * so the admin's next attempt is a fresh handshake rather than a lost cause.
 */
export function isRetryableOutcome(state: ConnectCallbackState): boolean {
  return state !== "linked" && state !== "malformed";
}

export interface ConnectCallbackViewProps {
  state: ConnectCallbackState;
  /** True once the SaaS session landed, regardless of how the link itself went. */
  sessionRestored: boolean;
  /** Closes the dialog before a next step navigates, so it doesn't land behind the overlay. */
  onDone: () => void;
}

/**
 * Step 3's body: what the round trip to Stirling came back with.
 *
 * <p>Five states in one step, on purpose. A failed link is still step 3 of the flow the admin
 * started, and saying so keeps them oriented; dropping them into a separate error dialog would
 * discard the progress bar that is the only thing explaining where they are.
 *
 * <p>Renders no actions of its own. The dialog's footer owns them, so Back/Continue sit where they
 * do on steps 1 and 2 rather than moving into the body for the last step.
 */
export function ConnectCallbackView({
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
        {/* No success banner: the step title already says Connected, and a green box
            would be the one coloured card in a flow built from flat rows and plain
            type. Failures below keep theirs, where the tone is the message. */}
        <p className="portal-connect__lede">
          {t(
            "portal.accountLink.connect.done.lede",
            "This server now runs against your Stirling account.",
          )}
        </p>
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
        <ConnectDoneSlide onNavigate={onDone} />
      </div>
    );
  }

  const { tone, title, body } = failure(state, t);
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
