import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useOpenFileReview } from "@app/hooks/useOpenFileReview";
import { ReviewRequiredModal } from "@app/components/shared/ReviewRequiredModal";
import {
  getReviewGateRequest,
  registerNeedsReviewResolver,
  settleReviewGate,
  subscribeReviewGate,
} from "@app/services/reviewGate";

const VERB_KEYS = {
  download: { key: "reviewTool.gate.verb.download", fallback: "download" },
  save: { key: "reviewTool.gate.verb.save", fallback: "save" },
  print: { key: "reviewTool.gate.verb.print", fallback: "print" },
  share: { key: "reviewTool.gate.verb.share", fallback: "share" },
} as const;

/**
 * Renders the review-required prompt for {@link requestReviewClearance} and
 * gives the gate its "which files need review" lookup. Mount once, high enough
 * to cover every export surface.
 */
export function ReviewGateHost() {
  const { t } = useTranslation();
  const badges = usePolicyFileBadges();
  const openFileReview = useOpenFileReview();

  useEffect(
    () =>
      registerNeedsReviewResolver((fileIds) =>
        fileIds.filter((id) =>
          (badges.get(id) ?? []).some((p) => p.failed && !p.enforcing),
        ),
      ),
    [badges],
  );

  useEffect(
    () => () => {
      if (getReviewGateRequest()) settleReviewGate(false);
    },
    [],
  );

  const request = useSyncExternalStore(
    subscribeReviewGate,
    getReviewGateRequest,
    () => null,
  );

  const verb = request ? VERB_KEYS[request.verb] : null;

  return (
    <ReviewRequiredModal
      opened={request !== null}
      action={verb ? t(verb.key, verb.fallback) : ""}
      count={request?.fileIds.length ?? 0}
      onCancel={() => settleReviewGate(false)}
      onReviewNow={() => {
        const first = request?.fileIds[0];
        settleReviewGate(false);
        if (first) openFileReview(first);
      }}
      onExportAnyway={() => settleReviewGate(true)}
    />
  );
}
