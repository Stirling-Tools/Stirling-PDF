import i18n from "@app/i18n";
import { alert } from "@app/components/toast";
import { connectionModeService } from "@app/services/connectionModeService";
import { selfHostedServerMonitor } from "@app/services/selfHostedServerMonitor";
import { saasServerMonitor } from "@app/services/saasServerMonitor";

const SERVER_TOAST_COOLDOWN_MS = 4000;
let lastServerToast = 0;

function warnOnce(title: string, body: string): void {
  const now = Date.now();
  if (now - lastServerToast <= SERVER_TOAST_COOLDOWN_MS) return;
  lastServerToast = now;
  alert({ alertType: "error", title, body, isPersistentPopup: false });
}

/**
 * Checks the CONNECTED server is reachable before a tool calls it.
 *
 * The desktop guard waits on the bundled local backend, which does not exist
 * here: its SaaS branch polls a stub that always reports offline, so every
 * operation was blocked with a "Backend Offline" toast. This version asks the
 * monitor that matches the current connection mode instead.
 *
 * A `checking` status is allowed through rather than blocked. The first poll
 * can still be in flight moments after launch, and letting the request proceed
 * surfaces a real HTTP error if the server is genuinely down, which is more
 * useful than a pre-emptive refusal.
 */
export async function ensureBackendReady(_endpoint?: string): Promise<boolean> {
  const mode = await connectionModeService.getCurrentMode();

  if (mode === "selfhosted") {
    let { status } = selfHostedServerMonitor.getSnapshot();
    if (status === "checking") {
      await Promise.race([
        selfHostedServerMonitor.checkNow(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      status = selfHostedServerMonitor.getSnapshot().status;
    }
    if (status === "offline") {
      // There is no local backend to fall back to, so this is a hard stop.
      // The offline banner already explains the outage, so no toast here.
      return false;
    }
    return true;
  }

  if (mode === "saas") {
    let { status } = saasServerMonitor.getSnapshot();
    if (status === "checking") {
      await Promise.race([
        saasServerMonitor.checkNow(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      status = saasServerMonitor.getSnapshot().status;
    }
    if (status === "offline") {
      warnOnce(
        i18n.t("setup.server.error.unreachable", "Could not connect to server"),
        i18n.t(
          "mobile.checkConnection",
          "Check your internet connection and try again.",
        ),
      );
      return false;
    }
    return true;
  }

  // No server chosen yet.
  warnOnce(
    i18n.t("mobile.account.notConnected", "Not connected"),
    i18n.t(
      "mobile.account.signedOutBody",
      "Sign in to run tools on Stirling Cloud or your own server.",
    ),
  );
  return false;
}
