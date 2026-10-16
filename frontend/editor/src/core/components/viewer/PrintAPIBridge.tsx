import { ViewerPrintHost } from "@app/components/viewer/print/ViewerPrintHost";
import type { ViewerPrintHostProps } from "@app/components/viewer/print/ViewerPrintHost";

/**
 * Connects the viewer's print action to the shared print dialog.
 *
 * A document that forbids printing renders nothing, so the viewer's print
 * action is left unregistered and does nothing. The flag defaults to forbidden
 * because printing is only offered once a caller establishes that the
 * document's permissions allow it.
 */
export function PrintAPIBridge({
  fileName,
  canPrint = false,
}: ViewerPrintHostProps) {
  return canPrint ? <ViewerPrintHost fileName={fileName} /> : null;
}
