import { Box } from "@mantine/core";
import CoreViewer from "@core/components/viewer/Viewer";
import type { ViewerProps } from "@core/components/viewer/Viewer";
import type { EmbedPdfViewerProps } from "@core/components/viewer/EmbedPdfViewer";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  POLICY_IN_FLIGHT_STATUSES,
  usePolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import { isClassificationCategory } from "@app/data/classificationPolicy";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";
import { PolicyEnforcementOverlay } from "@app/components/viewer/PolicyEnforcementOverlay";

type SignatureOverlayPassThrough = Pick<
  EmbedPdfViewerProps,
  | "signaturePreviews"
  | "signaturePreviewsReadOnly"
  | "signaturePlacementMode"
  | "signaturePlacementData"
  | "signaturePlacementType"
  | "onSignaturePreviewsChange"
  | "signatureOverlayApiRef"
>;

const Viewer = (props: ViewerProps & SignatureOverlayPassThrough) => {
  const { activeFileId } = useViewer();
  const allRuns = usePolicyRuns();
  const processorEnabled = useProcessorEnabled();

  // Runs persist in localStorage, so an editor-only server must ignore them
  // rather than overlay a policy that can no longer be running.
  const activeFileRuns =
    activeFileId && processorEnabled
      ? allRuns.filter(
          (r: PolicyRunRecord) =>
            r.fileId === activeFileId &&
            // Classification runs async and must never block the viewer.
            !isClassificationCategory(r.categoryId) &&
            (POLICY_IN_FLIGHT_STATUSES.includes(r.status) ||
              r.retrying === true),
        )
      : [];

  return (
    // isolation: "isolate" keeps the overlay's z-index self-contained so it
    // sits above EmbedPdfViewer's internal toolbar/sidebars regardless of
    // their own z-index values.
    <Box
      data-testid="viewer-root"
      data-file-id={activeFileId ?? ""}
      style={{
        position: "relative",
        height: "100%",
        isolation: "isolate",
      }}
    >
      <CoreViewer {...props} />
      {/* key resets dismissed state when the active file changes */}
      <PolicyEnforcementOverlay
        key={activeFileId ?? ""}
        runs={activeFileRuns}
      />
    </Box>
  );
};

export default Viewer;
