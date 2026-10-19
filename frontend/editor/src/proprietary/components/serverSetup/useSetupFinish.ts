import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { alert } from "@app/components/toast";
import {
  answerAnalytics,
  changeAdminPassword,
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
 * Saves the admin's new password, and later the settings. Changing the
 * password keeps the admin signed in, since the server leaves their token
 * valid. The token is swapped for a fresh one only as setup closes: a session
 * refresh puts the whole app into its loading state, which would unmount the
 * wizard. `savePassword` rejects with a PasswordChangeError when the server
 * refused the password for a reason the admin can fix.
 */
export function useSetupFinish({
  onDone,
  onPasswordChanged,
}: {
  onDone: () => void;
  onPasswordChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { refreshSession } = useAuth();
  const [state, setState] = useState<FinishState>("idle");
  const passwordChanged = useRef(false);

  const savePassword = useCallback(
    async (draft: ServerSetupDraft) => {
      try {
        await changeAdminPassword(draft.currentPassword, draft.newPassword);
      } catch (error) {
        // Only a refusal with a reason belongs on the Password step; a network
        // failure or server error is the generic "couldn't save" card.
        const status = httpStatus(error);
        if (status !== undefined && status >= 400 && status < 500) {
          throw new PasswordChangeError(serverErrorCode(error));
        }
        throw error;
      }
      passwordChanged.current = true;
      onPasswordChanged?.();
      alert({
        alertType: "success",
        title: t("serverSetup.password.saved", "Password saved"),
      });
    },
    [onPasswordChanged, t],
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
    savePassword,
    complete,
    reset: () => setState("idle"),
  };
}
