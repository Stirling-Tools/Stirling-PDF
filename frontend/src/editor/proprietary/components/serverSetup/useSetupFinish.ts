import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { springAuth } from "@app/auth/spring/springAuthClient";
import { alert } from "@app/components/toast";
import {
  answerAnalytics,
  changeAdminPassword,
  changeAdminUsername,
  httpStatus,
  markSetupComplete,
  requestRestart,
  saveServerSettings,
  waitForServer,
} from "@app/components/serverSetup/serverSetupApi";
import {
  settingsDelta,
  type ServerSetupDraft,
} from "@app/components/serverSetup/serverSetupDraft";

export type FinishState =
  | "idle"
  | "saving"
  | "restarting"
  | "manualRestart"
  | "restartFailed"
  | "error";

/** The server turned the new password down; `code` is its error key, such as "incorrectPassword". */
export class PasswordChangeError extends Error {
  constructor(readonly code: string | undefined) {
    super("Password change failed");
  }
}

/** The server turned the new username down; `code` is its error key, such as "usernameExists". */
export class UsernameChangeError extends Error {
  constructor(readonly code: string | undefined) {
    super("Username change failed");
  }
}

/**
 * The details were saved but signing in under the new username failed, so the
 * admin's old token no longer names an account and they must sign in again.
 */
export class SignInAgainError extends Error {
  constructor() {
    super("Sign in again");
  }
}

/** Only a refusal with a reason belongs on a field; anything else is a failed save. */
function isRefusal(error: unknown): boolean {
  const status = httpStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

function serverErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { error?: unknown } } }).response
    ?.data;
  return typeof data?.error === "string" ? data.error : undefined;
}

/**
 * Saves every answer in one write, records setup as done, then restarts once,
 * since almost every setting only applies on restart. A server that cannot
 * restart itself gets a "restart it yourself" card instead.
 */
async function applySettings(
  initial: ServerSetupDraft,
  draft: ServerSetupDraft,
): Promise<"done" | "restarting" | "manualRestart" | "restartFailed"> {
  const delta = settingsDelta(initial, draft);
  const firstAnalyticsAnswer =
    initial.analytics === null && draft.analytics !== null
      ? draft.analytics
      : null;
  if (firstAnalyticsAnswer !== null) delete delta["system.enableAnalytics"];

  await saveServerSettings(delta);
  if (firstAnalyticsAnswer !== null)
    await answerAnalytics(firstAnalyticsAnswer);
  await markSetupComplete();

  if (Object.keys(delta).length === 0) return "done";
  const restart = await requestRestart();
  if (restart === "restarting") return "restarting";
  return restart === "unsupported" ? "manualRestart" : "restartFailed";
}

/**
 * Saves the admin's new account details, and later the settings. Changing
 * the password keeps the admin signed in, since the server leaves their token
 * valid; that token is swapped for a fresh one only as setup closes, because a
 * session refresh puts the whole app into its loading state, which would
 * unmount the wizard.
 *
 * A rename is different: tokens name the username, so the old one stops
 * working at once and `saveAccount` signs straight back in with the new
 * details. The password goes first so the rename can prove it with the new
 * one, and a retry after a refused username does not change it again.
 * `saveAccount` rejects with PasswordChangeError or UsernameChangeError for a
 * refusal the admin can fix, and SignInAgainError once only a fresh sign-in helps.
 */
export function useSetupFinish({
  onDone,
  onPasswordChanged,
}: {
  onDone: () => void;
  onPasswordChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { refreshSession, user } = useAuth();
  const [state, setState] = useState<FinishState>("idle");
  const passwordChanged = useRef(false);

  const changePassword = useCallback(
    async (draft: ServerSetupDraft) => {
      try {
        await changeAdminPassword(draft.currentPassword, draft.newPassword);
      } catch (error) {
        if (isRefusal(error)) {
          throw new PasswordChangeError(serverErrorCode(error));
        }
        throw error;
      }
      passwordChanged.current = true;
      onPasswordChanged?.();
    },
    [onPasswordChanged],
  );

  const rename = useCallback(async (username: string, password: string) => {
    try {
      await changeAdminUsername(password, username);
    } catch (error) {
      if (isRefusal(error)) {
        throw new UsernameChangeError(serverErrorCode(error));
      }
      throw error;
    }
    const { session, error } = await springAuth
      .signInWithPassword({ email: username, password })
      .catch(() => ({ session: null, error: true }));
    if (error || !session) throw new SignInAgainError();
  }, []);

  const saveAccount = useCallback(
    async (draft: ServerSetupDraft) => {
      if (!passwordChanged.current) await changePassword(draft);
      const username = draft.adminUsername.trim();
      // The server compares names exactly but rejects one taken in any case.
      if (username.toLowerCase() !== (user?.username ?? "").toLowerCase()) {
        await rename(username, draft.newPassword);
      }
      alert({
        alertType: "success",
        title: t("serverSetup.account.saved", "Details saved"),
      });
    },
    [changePassword, rename, t, user?.username],
  );

  /** Leaves setup; rotates the token first when the password was changed. */
  const complete = useCallback(() => {
    onDone();
    if (passwordChanged.current) void refreshSession();
  }, [onDone, refreshSession]);

  const finish = useCallback(
    (initial: ServerSetupDraft, draft: ServerSetupDraft) => {
      setState("saving");
      applySettings(initial, draft)
        .then(async (result) => {
          if (result === "done") {
            complete();
            return;
          }
          setState(result);
          if (result === "restarting") {
            await waitForServer();
            window.location.reload();
          }
        })
        .catch(() => setState("error"));
    },
    [complete],
  );

  return {
    state,
    finish,
    saveAccount,
    complete,
    reset: () => setState("idle"),
  };
}
