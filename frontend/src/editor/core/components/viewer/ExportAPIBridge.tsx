import { useLayoutEffect } from "react";
import { useExportCapability } from "@embedpdf/plugin-export/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";

/** Supply originalFile for protected, read-only documents: native export can remove their encryption. */
export function ExportAPIBridge({
  disabled = false,
  originalFile,
}: {
  disabled?: boolean;
  originalFile?: Blob;
}) {
  const { provides: exportApi } = useExportCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useLayoutEffect(() => {
    if (documentReady && !disabled && (originalFile || exportApi)) {
      registerBridge("export", {
        state: { canExport: true },
        api: originalFile
          ? {
              saveAsCopy: () => ({
                toPromise: () => originalFile.arrayBuffer(),
              }),
            }
          : exportApi!,
      });
    }

    return () => {
      registerBridge("export", null);
    };
  }, [exportApi, documentReady, registerBridge, disabled, originalFile]);

  return null;
}
