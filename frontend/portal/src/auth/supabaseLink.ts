/**
 * Hosted-login seam for the account-link surface.
 *
 * Linking auth is a POPUP to the hosted SaaS login (which already offers SSO +
 * create-account), NOT a bespoke email/password form. We open the SaaS login
 * URL with `window.open`, the user signs in / signs up there, and the SaaS page
 * posts the resulting session back via `postMessage`. We validate
 * `event.origin === the SaaS origin` before trusting the JWT, then hand it to the
 * local backend (api/link.ts) to register this instance.
 *
 * Config: `VITE_SAAS_WEB_URL` (the hosted login origin). When absent
 * {@link isSaasLoginConfigured} is false and the UI degrades to a "configure the
 * SaaS login URL" state — same pattern the old Supabase seam used.
 *
 * ASSUMPTION (stated): the real SaaS-side postMessage success page does NOT exist
 * yet — auth is being moved to a shared folder. The portal side of the handshake
 * below is built for real (origin-validated message listener + popup lifecycle).
 * For dev / Storybook / tests, {@link openSaasLoginPopup} accepts a `stub` that
 * simulates the popup posting a session back, so the flow is demoable + testable
 * without the live SaaS page. Inject `VITE_SAAS_WEB_URL` and ship the SaaS
 * success page to go live — no portal code change.
 */

const webUrl = import.meta.env.VITE_SAAS_WEB_URL;

export const isSaasLoginConfigured = Boolean(webUrl);

/** The session the SaaS login popup posts back. */
export interface SaasSession {
  /** SaaS JWT (Supabase access token) the local backend validates + links with. */
  access_token: string;
}

/** Shape of the postMessage payload the SaaS success page sends. */
interface LinkMessage {
  type: "stirling-account-link";
  session: SaasSession;
}

function isLinkMessage(data: unknown): data is LinkMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "stirling-account-link" &&
    typeof (data as { session?: { access_token?: unknown } }).session
      ?.access_token === "string"
  );
}

/** Resolved login origin (for `event.origin` validation), or null when unset. */
function loginOrigin(): string | null {
  if (!webUrl) return null;
  try {
    return new URL(webUrl).origin;
  } catch {
    return null;
  }
}

/** The hosted login URL to open. */
function loginUrl(): string {
  return new URL("/login?link=1", webUrl).toString();
}

export interface OpenPopupOptions {
  /**
   * DEV/TEST ONLY. When provided, no real popup is opened — instead this is
   * invoked with a `post(session)` callback that simulates the SaaS success page
   * posting a session back. Lets the popup handshake be demoed + tested without
   * the live SaaS page.
   */
  stub?: (post: (session: SaasSession) => void) => void;
}

/**
 * Opens the hosted SaaS login popup and resolves with the session it posts back.
 * Rejects if the popup is blocked, the user closes it without signing in, or
 * (in the real flow) login isn't configured.
 */
export function openSaasLoginPopup(
  opts: OpenPopupOptions = {},
): Promise<SaasSession> {
  // Dev/Storybook/test stub: skip the real popup, simulate the postMessage.
  if (opts.stub) {
    return new Promise((resolve) => {
      opts.stub!((session) => resolve(session));
    });
  }

  if (!isSaasLoginConfigured) {
    return Promise.reject(
      new Error(
        "SaaS login is not configured — set VITE_SAAS_WEB_URL to enable account linking.",
      ),
    );
  }

  const origin = loginOrigin();
  const popup = window.open(
    loginUrl(),
    "stirling-account-link",
    "width=480,height=720,menubar=no,toolbar=no",
  );
  if (!popup) {
    return Promise.reject(
      new Error("Couldn't open the login window — check your popup blocker."),
    );
  }

  return new Promise((resolve, reject) => {
    function cleanup() {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    }

    function onMessage(event: MessageEvent) {
      // Only trust messages from the configured SaaS login origin.
      if (event.origin !== origin) return;
      if (!isLinkMessage(event.data)) return;
      cleanup();
      popup?.close();
      resolve(event.data.session);
    }

    window.addEventListener("message", onMessage);

    // If the user closes the popup without completing login, reject.
    const closedTimer = window.setInterval(() => {
      if (popup?.closed) {
        cleanup();
        reject(new Error("Login window closed before linking finished."));
      }
    }, 500);
  });
}
