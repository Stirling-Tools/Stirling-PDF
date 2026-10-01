import type { TFunction } from "i18next";
import type { SigningItem } from "@app/utils/signingItems";
import { isSigningItemClosed } from "@app/utils/signingItems";
import type {
  SessionSummary,
  SignRequestSummary,
} from "@app/types/signingSession";

export function signingStatus(
  item: SigningItem,
  t: TFunction,
): { color: string; label: string } {
  if (item.kind === "session") {
    const s = item as SessionSummary;
    if (s.finalized) {
      return { color: "green", label: t("certSign.finalized", "Finalized") };
    }
    if (isSigningItemClosed(item)) {
      return { color: "orange", label: t("signMenu.closedTab", "Closed") };
    }
    const signed = s.signedCount ?? 0;
    const total = s.participantCount ?? 0;
    if (total > 0 && signed === total) {
      return {
        color: "green",
        label: t("certSign.readyToFinalize", "Ready to finalize"),
      };
    }
    if (total > 0) {
      return {
        color: signed > 0 ? "yellow" : "blue",
        label: t(
          "certSign.signatureProgress",
          "{{signedCount}}/{{totalCount}} signatures",
          { signedCount: signed, totalCount: total },
        ),
      };
    }
    return {
      color: "blue",
      label: t("certSign.awaitingSignatures", "Awaiting signatures"),
    };
  }
  const req = item as SignRequestSummary;
  if (req.accessExpired) {
    return {
      color: "orange",
      label: t("signRequest.expired", "Access expired"),
    };
  }
  if (req.finalized) {
    return { color: "green", label: t("certSign.finalized", "Finalized") };
  }
  if (req.closed && req.myStatus !== "DECLINED") {
    return { color: "orange", label: t("signMenu.closedTab", "Closed") };
  }
  switch (req.myStatus) {
    case "SIGNED":
      return {
        color: "blue",
        label: t("signMenu.submitted", "Submitted · awaiting finalization"),
      };
    case "DECLINED":
      return { color: "red", label: t("certSign.declined", "Declined") };
    case "VIEWED":
      return { color: "blue", label: t("certSign.viewed", "Viewed") };
    default:
      return { color: "orange", label: t("certSign.pending", "Pending") };
  }
}
