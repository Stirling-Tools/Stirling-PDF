import { useCallback, useState } from "react";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { useOpenFileReview } from "@app/hooks/useOpenFileReview";
import { ReviewRequiredModal } from "@app/components/shared/ReviewRequiredModal";

interface PendingExport {
  /** Translated verb for the blocked action (download / print / share / save). */
  action: string;
  /** Files that still need review, in target order. */
  fileIds: string[];
  /** The export to run if the user overrides the gate. */
  proceed: () => void;
}

interface ReviewExportGate {
  /**
   * Runs `proceed` unless a target needs review, in which case the modal opens
   * and `proceed` runs only if the user continues anyway.
   */
  guardExport: (
    action: string,
    targetIds: string[],
    proceed: () => void,
  ) => void;
  /** The gate modal; render once wherever the guarded action lives. */
  gateModal: React.ReactNode;
}

/**
 * Gate primitive — don't call from components; use `useExportActions`, which
 * applies it to every export action so the guard can't be forgotten.
 */
export function useReviewExportGate(): ReviewExportGate {
  const badges = usePolicyFileBadges();
  const openFileReview = useOpenFileReview();
  const [pending, setPending] = useState<PendingExport | null>(null);

  const guardExport = useCallback(
    (action: string, targetIds: string[], proceed: () => void) => {
      const needing = targetIds.filter((id) =>
        (badges.get(id) ?? []).some((p) => p.failed && !p.enforcing),
      );
      if (needing.length === 0) {
        proceed();
        return;
      }
      setPending({ action, fileIds: needing, proceed });
    },
    [badges],
  );

  const gateModal = (
    <ReviewRequiredModal
      opened={pending !== null}
      action={pending?.action ?? ""}
      count={pending?.fileIds.length ?? 0}
      onCancel={() => setPending(null)}
      onReviewNow={() => {
        const first = pending?.fileIds[0];
        setPending(null);
        if (first) openFileReview(first);
      }}
      onExportAnyway={() => {
        const proceed = pending?.proceed;
        setPending(null);
        proceed?.();
      }}
    />
  );

  return { guardExport, gateModal };
}
