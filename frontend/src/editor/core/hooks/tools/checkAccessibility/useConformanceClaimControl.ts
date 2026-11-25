import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { alert } from "@editor/components/toast";
import { useFileContext } from "@editor/contexts/FileContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { createStirlingFilesAndStubs } from "@editor/services/fileStubHelpers";
import {
  PolicyBlockedError,
  assertFilesNotBlocked,
  policySourceIds,
} from "@editor/services/policyFileGuard";
import {
  applyConformanceClaim,
  type PdfUaPart,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { useReviewConformanceClaim } from "@editor/tools/pdfTextEditor/store/reviewConformanceClaim";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import type { FileId } from "@editor/types/file";

// The rewrite holds the whole file in memory twice, as read and as written.
const MAX_REWRITE_BYTES = 256 * 1024 * 1024;

/** A checked file's PDF/UA claim, and a way to change it. */
export interface ConformanceClaimControl {
  /** Whether the file declares PDF/UA, the review's unsaved edits included. */
  declared: boolean;
  /** The declared part while the review has the file open; null otherwise, as the report does not say. */
  part: number | null;
  /** False when the claim cannot be written, as for an encrypted file. */
  editable: boolean;
  /** True while the file is being rewritten. */
  writing: boolean;
  set: (part: PdfUaPart | null) => void;
}

/**
 * The claim of a checked file. While the review has the file open a change joins
 * its unsaved edits, to be written by its Save. Otherwise the file is rewritten at
 * once as a new version, which the tool then checks again; `onWritten` gets its id.
 * Null when there is no report to show it against.
 */
export function useConformanceClaimControl(
  fileId: FileId | null,
  report: AccessibilityReport | null,
  onWritten: (fileId: FileId) => void,
): ConformanceClaimControl | null {
  const { t } = useTranslation();
  const review = useReviewConformanceClaim();
  const { consumeFiles, selectors } = useFileContext();
  const { activeFileId, setActiveFileId } = useViewer();
  const [writing, setWriting] = useState(false);

  const write = useCallback(
    async (part: PdfUaPart | null) => {
      const file = fileId ? selectors.getFile(fileId) : undefined;
      const parentStub = fileId ? selectors.getStirlingFileStub(fileId) : null;
      if (!fileId || !file || !parentStub) return;
      const policyIds = policySourceIds(parentStub);
      setWriting(true);
      try {
        assertFilesNotBlocked(policyIds);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const claimed = await applyConformanceClaim(bytes, part);
        if (claimed === bytes) return;
        const edited = new File([claimed as BlobPart], file.name, {
          type: "application/pdf",
        });
        const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
          [edited],
          parentStub,
          "checkAccessibility",
        );
        assertFilesNotBlocked(policyIds);
        const [written] = await consumeFiles([fileId], stirlingFiles, stubs);
        if (!written) return;
        if (activeFileId === fileId) setActiveFileId(written);
        onWritten(written);
      } catch (error) {
        console.error(error);
        alert({
          alertType: "error",
          title: t(
            "checkAccessibility.error.conformanceClaim",
            "The PDF/UA claim couldn't be saved.",
          ),
          body: error instanceof PolicyBlockedError ? error.message : undefined,
        });
      } finally {
        setWriting(false);
      }
    },
    [
      fileId,
      selectors,
      consumeFiles,
      activeFileId,
      setActiveFileId,
      onWritten,
      t,
    ],
  );

  if (!fileId || !report) return null;
  if (review?.fileId === fileId)
    return {
      declared: review.part !== null,
      part: review.part,
      editable: review.editable,
      writing: false,
      set: review.set,
    };
  const size = selectors.getFile(fileId)?.size ?? Infinity;
  return {
    declared: report.declaresConformance,
    part: null,
    editable: !report.summary.encrypted && size <= MAX_REWRITE_BYTES,
    writing,
    set: (part) => void write(part),
  };
}
