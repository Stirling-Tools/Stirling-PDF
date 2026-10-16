import { useEffect, useState } from "react";
import { ViewerPrintHost } from "@core/components/viewer/print/ViewerPrintHost";
import type { ViewerPrintHostProps } from "@core/components/viewer/print/ViewerPrintHost";
import { DesktopOs, getDesktopOs } from "@app/services/platformService";

/**
 * Connects the viewer's print action to the shared print dialog, and tells it
 * when the platform owns the print dialog itself.
 *
 * macOS prints through the OS dialog because Tauri/WKWebView cannot print an
 * embedded frame reliably:
 * https://github.com/tauri-apps/tauri/issues/13451#issuecomment-4045138142
 *
 * A document that forbids printing renders nothing, so the viewer's print
 * action is left unregistered and does nothing.
 */
export function PrintAPIBridge({
  fileName,
  canPrint = false,
}: ViewerPrintHostProps) {
  const [systemPrintDialog, setSystemPrintDialog] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const isMac = (await getDesktopOs()) === DesktopOs.Mac;
      if (!cancelled) {
        setSystemPrintDialog(isMac);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!canPrint) {
    return null;
  }

  // Printing is withheld until the platform is known: offering the dialog with
  // the wrong handoff and correcting it a moment later would show controls this
  // platform ignores, or hand the job to the wrong print path.
  if (systemPrintDialog === null) {
    return null;
  }

  return (
    <ViewerPrintHost
      fileName={fileName}
      systemPrintDialog={systemPrintDialog}
    />
  );
}
