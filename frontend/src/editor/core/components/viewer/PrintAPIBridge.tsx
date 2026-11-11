import { useLayoutEffect, useRef } from "react";
import { usePrintCapability } from "@embedpdf/plugin-print/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";

export interface PrintAPIBridgeProps {
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
  canPrint?: boolean;
}

/**
 * Connects the PDF print plugin to the shared ViewerContext.
 */
export function PrintAPIBridge({ canPrint = false }: PrintAPIBridgeProps) {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  const allowed = useRef(canPrint);
  allowed.current = canPrint;

  useLayoutEffect(() => {
    if (print && documentReady && canPrint) {
      registerBridge("print", {
        state: {},
        api: {
          print: () => {
            if (allowed.current) print.print();
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
