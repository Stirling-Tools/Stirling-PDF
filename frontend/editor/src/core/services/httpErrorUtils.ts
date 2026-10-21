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

function messageFromResponse(
  status: number | undefined,
  raw: unknown,
): { title: string; body: string } {
  let parsed: unknown = undefined;
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

export function extractAxiosErrorMessage(error: unknown): {
  title: string;
  body: string;
} {
  if (axios.isAxiosError(error)) {
    return messageFromResponse(error.response?.status, error.response?.data);
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

/** Blob.text is missing in some test/legacy environments; FileReader is universal. */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/**
 * Downloads request `responseType: "blob"`, so an error response arrives as a
 * Blob and the synchronous extractor cannot read its JSON message. Resolve the
 * blob first, then run the same status and message rules.
 */
export async function extractAxiosErrorMessageAsync(error: unknown): Promise<{
  title: string;
  body: string;
}> {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const text = await readBlobText(error.response.data);
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* keep the plain text body */
      }
      return messageFromResponse(error.response.status, data);
    } catch {
      /* fall through to the synchronous extractor */
    }
  }
  return extractAxiosErrorMessage(error);
}
