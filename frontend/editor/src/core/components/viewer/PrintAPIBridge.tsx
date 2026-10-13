import { useEffect } from "react";
import { usePrintCapability } from "@embedpdf/plugin-print/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

export interface PrintAPIBridgeProps {
  canPrint?: boolean;
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
}

/**
 * Connects the PDF print plugin to the shared ViewerContext.
 */
export function PrintAPIBridge({ canPrint = false }: PrintAPIBridgeProps) {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (print && documentReady) {
      // Register this bridge with ViewerContext
      registerBridge("print", {
        state: {},
        api: {
          print: () => {
            if (canPrint) print.print();
          },
        },
      });
    }

    return () => {
      registerBridge("print", null);
    };
  }, [print, documentReady, registerBridge, canPrint]);

  return null;
}
