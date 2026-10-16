import { isAxiosError } from "axios";
import type { TFunction } from "i18next";
import apiClient from "@app/services/apiClient";

/**
 * Link keys created in Stirling Cloud. Shared by the License key form and the connect dialog so a
 * key pasted in either place is recognised and refused the same way.
 */

export const LINK_KEY_PREFIX = "stlk_";

export function isLinkKey(value: string): boolean {
  return value.trim().startsWith(LINK_KEY_PREFIX);
}

export type LinkKeyErrorCode =
  | "KEY_FORMAT"
  | "KEY_REJECTED"
  | "ALREADY_LINKED"
  | "LINK_IN_PROGRESS"
  | "CONNECT_FAILED"
  | "NOT_OWNER"
  | "NOT_AVAILABLE"
  | "UNKNOWN";

export class LinkKeyError extends Error {
  constructor(readonly code: LinkKeyErrorCode) {
    super(code);
    this.name = "LinkKeyError";
  }
}

const SERVER_CODES: readonly LinkKeyErrorCode[] = [
  "KEY_FORMAT",
  "KEY_REJECTED",
  "ALREADY_LINKED",
  "LINK_IN_PROGRESS",
  "CONNECT_FAILED",
];

function codeOf(error: unknown): LinkKeyErrorCode {
  if (!isAxiosError(error) || !error.response) return "CONNECT_FAILED";
  const sent = (error.response.data as { error?: unknown } | undefined)?.error;
  if (typeof sent === "string" && (SERVER_CODES as string[]).includes(sent)) {
    return sent as LinkKeyErrorCode;
  }
  if (error.response.status === 403) return "NOT_OWNER";
  if (error.response.status === 404) return "NOT_AVAILABLE";
  return "UNKNOWN";
}

/** Whitespace is dropped so a key that wrapped in an email still reads. */
export async function redeemLinkKey(key: string): Promise<void> {
  try {
    await apiClient.post(
      "/api/v1/account-link/key",
      { key: key.replace(/\s+/g, "") },
      { suppressErrorToast: true },
    );
  } catch (error) {
    throw new LinkKeyError(codeOf(error));
  }
}

export function linkKeyErrorMessage(error: unknown, t: TFunction): string {
  const code = error instanceof LinkKeyError ? error.code : "UNKNOWN";
  switch (code) {
    case "KEY_FORMAT":
      return t(
        "admin.settings.premium.linkKey.error.format",
        "That isn’t a complete link key. Copy it again from Stirling Cloud.",
      );
    case "KEY_REJECTED":
      return t(
        "admin.settings.premium.linkKey.error.rejected",
        "Stirling Cloud didn’t accept this key. It may have been used, revoked or expired. Ask for a new one.",
      );
    case "ALREADY_LINKED":
      return t(
        "admin.settings.premium.linkKey.error.alreadyLinked",
        "This server is already connected. Disconnect it first to use a different account.",
      );
    case "LINK_IN_PROGRESS":
      return t(
        "admin.settings.premium.linkKey.error.inProgress",
        "This server is already being connected. Try again in a moment.",
      );
    case "CONNECT_FAILED":
      return t(
        "admin.settings.premium.linkKey.error.unreachable",
        "Couldn’t reach Stirling Cloud. Check the server’s internet access and try again.",
      );
    case "NOT_OWNER":
      return t(
        "admin.settings.premium.linkKey.error.notOwner",
        "Only the organization owner can connect this server.",
      );
    case "NOT_AVAILABLE":
      return t(
        "admin.settings.premium.linkKey.error.notAvailable",
        "Connecting to Stirling Cloud is turned off on this server.",
      );
    default:
      return t(
        "admin.settings.premium.linkKey.error.unknown",
        "Couldn’t connect this server. Try again.",
      );
  }
}
