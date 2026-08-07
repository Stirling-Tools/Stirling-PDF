import { useEffect } from "react";
import { usePrintCapability } from "@embedpdf/plugin-print/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import { printPdfNatively } from "@editor/services/nativePrintService";
import { DesktopOs, getDesktopOs } from "@editor/services/platformService";
import { PrintAPIBridgeProps } from "@core/components/viewer/PrintAPIBridge";

export function PrintAPIBridge({ file, url, fileName }: PrintAPIBridgeProps) {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (documentReady) {
      registerBridge("print", {
        state: {},
        api: {
          print: () => {
            void (async () => {
              // macOS desktop uses a native print path because Tauri/WKWebView does not
              // reliably support iframe-based PDF printing yet:
              // https://github.com/tauri-apps/tauri/issues/13451#issuecomment-4045138142
              if ((await getDesktopOs()) === DesktopOs.Mac) {
                await printPdfNatively(file, url, fileName);
                return;
              }

              print?.print?.();
            })().catch((error) => {
              console.error("[Desktop Print] Print failed", error);
            });
          },
        },
      });
    }

    return () => {
      registerBridge("print", null);
    };
  }, [documentReady, file, fileName, print, registerBridge, url]);

  return null;
}
