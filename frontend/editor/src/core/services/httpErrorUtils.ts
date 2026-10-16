import axios from "axios";
import i18n from "i18next";

const friendlyFallback = () =>
  i18n.t(
    "error.requestFallback",
    "There was an error processing your request.",
  );
const corruptedFilesMessage = () =>
  i18n.t(
    "error.invalidOrCorruptedFiles",
    "Process failed due to invalid/corrupted file(s)",
  );
const MAX_TOAST_BODY_CHARS = 400; // avoid massive, unreadable toasts

export function clampText(s: string, max = MAX_TOAST_BODY_CHARS): string {
  return s && s.length > max ? `${s.slice(0, max)}…` : s;
}

function isUnhelpfulMessage(msg: string | null | undefined): boolean {
  const s = (msg || "").trim();
  if (!s) return true;
  // Common unhelpful payloads we see
  if (s === "{}" || s === "[]") return true;
  if (/^request failed/i.test(s)) return true;
  if (/^network error/i.test(s)) return true;
  if (/^[45]\d\d\b/.test(s)) return true; // "500 Server Error" etc.
  return false;
}

export function titleForStatus(status?: number): string {
  if (!status) return i18n.t("error.networkError", "Network error");
  if (status >= 500) return i18n.t("error.serverError", "Server error");
  if (status >= 400) return i18n.t("error.requestError", "Request error");
  return i18n.t("error.requestFailed", "Request failed");
}

export function extractAxiosErrorMessage(error: unknown): {
  title: string;
  body: string;
} {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const _statusText = error.response?.statusText || "";
    let parsed: unknown = undefined;
    const raw = error.response?.data;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* keep as string */
      }
    } else {
      parsed = raw;
    }
    const extractIds = (): string[] | undefined => {
      const errorFileIds = (parsed as { errorFileIds?: unknown })?.errorFileIds;
      if (Array.isArray(errorFileIds)) return errorFileIds as string[];
      const rawText = typeof raw === "string" ? raw : "";
      const uuidMatches = rawText.match(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
      );
      return uuidMatches && uuidMatches.length > 0
        ? Array.from(new Set(uuidMatches))
        : undefined;
    };

    const body = ((): string => {
      const data = parsed;
      if (!data) return typeof raw === "string" ? raw : "";
      const ids = extractIds();
      if (ids && ids.length > 0) {
        return i18n.t("error.failedFiles", "Failed files: {{ids}}", {
          ids: ids.join(", "),
        });
      }
      const message = (data as { message?: unknown })?.message;
      if (message) return message as string;
      if (typeof raw === "string") return raw;
      try {
        return JSON.stringify(data);
      } catch {
        return "";
      }
    })();
    const ids = extractIds();
    const title = titleForStatus(status);
    if (ids && ids.length > 0) {
      return { title, body: corruptedFilesMessage() };
    }
    if (status === 422) {
      const fallbackMsg = corruptedFilesMessage();
      const bodyMsg = isUnhelpfulMessage(body) ? fallbackMsg : body;
      return { title, body: bodyMsg };
    }
    const bodyMsg = isUnhelpfulMessage(body) ? friendlyFallback() : body;
    return { title, body: bodyMsg };
  }
  try {
    const msg = ((error as { message?: unknown })?.message ||
      String(error)) as string;
    return {
      title: titleForStatus(),
      body: isUnhelpfulMessage(msg) ? friendlyFallback() : msg,
    };
  } catch (e) {
    // ignore extraction errors
    console.debug("extractAxiosErrorMessage", e);
    return { title: titleForStatus(), body: friendlyFallback() };
  }
}
