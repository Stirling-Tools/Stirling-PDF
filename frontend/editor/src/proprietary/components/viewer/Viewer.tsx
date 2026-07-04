import { Box } from "@mantine/core";
import CoreViewer from "@core/components/viewer/Viewer";
import type { ViewerProps } from "@core/components/viewer/Viewer";
import type { EmbedPdfViewerProps } from "@core/components/viewer/EmbedPdfViewer";
import { useViewer } from "@app/contexts/ViewerContext";
import {
  usePolicyRuns,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";
import { PolicyEnforcementOverlay } from "./PolicyEnforcementOverlay";

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

const IN_FLIGHT_OR_FAILED = new Set([
  "PENDING",
  "RUNNING",
  "WAITING_FOR_INPUT",
  "FAILED",
  "CANCELLED",
]);

const Viewer = (props: ViewerProps & SignatureOverlayPassThrough) => {
  const { activeFileId } = useViewer();
  const allRuns = usePolicyRuns();

  const activeFileRuns = activeFileId
    ? allRuns.filter(
        (r: PolicyRunRecord) =>
          r.fileId === activeFileId &&
          (IN_FLIGHT_OR_FAILED.has(r.status) || r.retrying === true),
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
      <PolicyEnforcementOverlay key={activeFileId ?? ""} runs={activeFileRuns} />
    </Box>
  );
};

export default Viewer;
