import { useEffect } from "react";
import { usePrintCapability } from "@embedpdf/plugin-print/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";

export interface PrintAPIBridgeProps {
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
}

/**
 * Connects the PDF print plugin to the shared ViewerContext.
 */
export function PrintAPIBridge(_props: PrintAPIBridgeProps) {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (print && documentReady) {
      // Register this bridge with ViewerContext
      registerBridge("print", {
        state: {},
        api: {
          print: () => print.print(),
        },
      });
    }

    return () => {
      registerBridge("print", null);
    };
  }, [print, documentReady, registerBridge]);

  return null;
}
