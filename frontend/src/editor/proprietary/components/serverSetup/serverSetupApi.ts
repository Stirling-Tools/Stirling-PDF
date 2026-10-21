import apiClient from "@app/services/apiClient";
import { putAdminSettings } from "@app/api/adminSettings";

const RESTART_POLL_MS = 1500;
const RESTART_GIVE_UP_MS = 120_000;

/** The server's current settings, secrets masked. */
export async function fetchServerSettings(): Promise<Record<string, unknown>> {
  const response = await apiClient.get<Record<string, unknown>>(
    "/api/v1/admin/settings",
  );
  return response.data ?? {};
}

/** Writes dotted settings keys to settings.yml; they apply on the next restart. */
export async function saveServerSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(settings).length === 0) return;
  await putAdminSettings(settings);
}

/**
 * Answers the first-launch analytics question. Unlike a settings write it
 * applies at once, so the separate analytics prompt does not come back if the
 * restart afterwards fails.
 */
export async function answerAnalytics(enabled: boolean): Promise<void> {
  const formData = new FormData();
  formData.append("enabled", String(enabled));
  await apiClient.post("/api/v1/settings/update-enable-analytics", formData);
}

/** Whether the server can reach an OpenID Connect issuer's discovery document. */
export async function checkIssuer(issuer: string): Promise<boolean> {
  const response = await apiClient.post<{ reachable?: boolean }>(
    "/api/v1/admin/settings/check-issuer",
    { issuer },
    { suppressErrorToast: true },
  );
  return response.data?.reachable === true;
}

/** Records that setup is done; applies at once, so the wizard never reappears. */
export async function markSetupComplete(): Promise<void> {
  await apiClient.post("/api/v1/admin/settings/setup-complete");
}

/**
 * Sets the signed-in admin's new password in place of the default one. Errors
 * surface to the caller rather than as a toast, since setup shows them on its
 * Password step.
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("currentPassword", currentPassword);
  formData.append("newPassword", newPassword);
  formData.append("confirmPassword", newPassword);
  await apiClient.post("/api/v1/user/change-password-on-login", formData, {
    suppressErrorToast: true,
  });
}

/**
 * Renames the signed-in admin. The server signs the session out afterwards,
 * and tokens name the old username, so the caller must sign in again.
 */
export async function changeAdminUsername(
  currentPassword: string,
  newUsername: string,
): Promise<void> {
  const formData = new FormData();
  formData.append("currentPasswordChangeUsername", currentPassword);
  formData.append("newUsername", newUsername);
  await apiClient.post("/api/v1/user/change-username", formData, {
    suppressErrorToast: true,
  });
}

/** The HTTP status of a failed request, when the server answered at all. */
export function httpStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } }).response
    ?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Asks the server to restart. "unsupported" is the server saying it cannot
 * restart itself (503, as outside a packaged JAR); "failed" is anything else.
 */
export async function requestRestart(): Promise<
  "restarting" | "unsupported" | "failed"
> {
  try {
    await apiClient.post("/api/v1/admin/settings/restart", undefined, {
      suppressErrorToast: true,
    });
    return "restarting";
  } catch (error) {
    return httpStatus(error) === 503 ? "unsupported" : "failed";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function serverAnswers(): Promise<boolean> {
  try {
    await apiClient.get("/api/v1/info/status", { suppressErrorToast: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves once the server has gone down and come back, so the reload never
 * lands on the old process in its last seconds. Gives up after two minutes so
 * the caller can reload anyway and let the normal startup screens take over.
 */
export async function waitForServer(): Promise<void> {
  const giveUpAt = Date.now() + RESTART_GIVE_UP_MS;
  while (Date.now() < giveUpAt && (await serverAnswers())) {
    await delay(RESTART_POLL_MS);
  }
  while (Date.now() < giveUpAt && !(await serverAnswers())) {
    await delay(RESTART_POLL_MS);
  }
}
