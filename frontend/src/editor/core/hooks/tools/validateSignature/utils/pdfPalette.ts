import { colorPalette } from "@editor/services/reportPdf/reportPalette";
import type { SignatureStatusKind } from "@editor/hooks/tools/validateSignature/utils/signatureStatus";

export const statusKindToPdfColor = (kind: SignatureStatusKind) => {
  switch (kind) {
    case "valid":
      return colorPalette.success;
    case "warning":
      return colorPalette.warning;
    case "invalid":
      return colorPalette.danger;
    default:
      return colorPalette.neutral;
  }
};
