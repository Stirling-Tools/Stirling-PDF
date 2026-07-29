import type { TFunction } from "i18next";
import type { ReviewReason, ReviewReasonKind } from "@portal/api/review";
import { DEFAULT_CLASSIFICATION_LABELS } from "@app/data/classificationLabels";

const LABEL_NAMES = new Map(
  DEFAULT_CLASSIFICATION_LABELS.map((label) => [label.id, label.name]),
);

/** Producer token the backend stamps on classifier-sourced confidences
 *  (ClassificationConfidenceSource.PRODUCER). */
const CLASSIFICATION_PRODUCER = "classification";

/** Display name for a classification label id (translated, falls back to the
 *  built-in name, then the raw id). */
export function labelName(t: TFunction, id: string | null): string {
  if (!id) return "";
  return t(`classification.labels.${id}`, LABEL_NAMES.get(id) ?? id);
}

/** Short name for a reason kind — used by the filter dropdown. */
export function reasonKindLabel(t: TFunction, kind: ReviewReasonKind): string {
  switch (kind) {
    case "WATCHED_LABEL":
      return t("portal.review.reasonKind.watchedLabel", "Watched label");
    case "LOW_CONFIDENCE":
      return t("portal.review.reasonKind.lowConfidence", "Low confidence");
    case "SKIPPED_LABEL":
      return t("portal.review.reasonKind.skippedLabel", "Possible label");
    case "NO_LABEL":
      return t("portal.review.reasonKind.noLabel", "No label");
    case "RUN_FAILED":
      return t("portal.review.reasonKind.runFailed", "Run failed");
  }
}

/** Full sentence for one reason, confidence appended where it exists. */
export function reasonText(t: TFunction, reason: ReviewReason): string {
  const pct =
    reason.confidence != null
      ? ` (${Math.round(reason.confidence * 100)}%)`
      : "";
  switch (reason.kind) {
    case "WATCHED_LABEL":
      return t("portal.review.reason.watchedLabel", {
        label: labelName(t, reason.labelId),
        defaultValue: "Watched label: {{label}}",
      });
    case "LOW_CONFIDENCE":
      // Any step can report a confidence, so the sentence names the step unless it
      // was the classifier (whose subject is a label the reader already knows).
      if (reason.producer && reason.producer !== CLASSIFICATION_PRODUCER) {
        return (
          (reason.labelId
            ? t("portal.review.reason.lowConfidenceFrom", {
                producer: reason.producer,
                subject: reason.labelId,
                defaultValue: "Low {{producer}} confidence: {{subject}}",
              })
            : t("portal.review.reason.lowConfidenceTool", {
                producer: reason.producer,
                defaultValue: "Low {{producer}} confidence",
              })) + pct
        );
      }
      return (
        t("portal.review.reason.lowConfidence", {
          label: labelName(t, reason.labelId),
          defaultValue: "Low confidence: {{label}}",
        }) + pct
      );
    case "SKIPPED_LABEL":
      return (
        t("portal.review.reason.skippedLabel", {
          label: labelName(t, reason.labelId),
          defaultValue: "Possible {{label}}, not assigned",
        }) + pct
      );
    case "NO_LABEL":
      return t("portal.review.reason.noLabel", "No label matched");
    case "RUN_FAILED":
      return t("portal.review.reason.runFailed", "Policy run failed");
  }
}

/** "/api/v1/misc/compress-pdf" -> "compress pdf" — a readable step name. */
export function stepDisplayName(operation: string): string {
  const last = operation.split("/").filter(Boolean).pop() ?? operation;
  return last.replace(/-/g, " ");
}
