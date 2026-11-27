import { useLayoutEffect, useRef } from "react";
import { useExportCapability } from "@embedpdf/plugin-export/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import {
  keepSourcePdfVersion,
  readPdfHeaderVersion,
} from "@editor/utils/pdfHeaderVersion";
import type { ExportAPIWrapper } from "@editor/contexts/viewer/viewerBridges";

/** PDFium saves a 2.0 file as 1.0, so restore the header of the bytes the viewer opened. */
function keepingSourceVersion(
  exportApi: ExportAPIWrapper,
  getSourceFile: () => Blob | undefined,
): ExportAPIWrapper {
  return {
    saveAsCopy: () => {
      const task = exportApi.saveAsCopy();
      const sourceVersion = readSourceVersion(getSourceFile());
      return {
        toPromise: async () => {
          const [output, version] = await Promise.all([
            task.toPromise(),
            sourceVersion,
          ]);
          return keepSourcePdfVersion(output, version);
        },
      };
    },
  };
}

async function readSourceVersion(
  sourceFile: Blob | undefined,
): Promise<string | null> {
  if (!sourceFile) return null;
  try {
    const head = await sourceFile.slice(0, 1024).arrayBuffer();
    return readPdfHeaderVersion(new Uint8Array(head));
  } catch {
    // An unreadable source must not block the save.
    return null;
  }
}

/** Supply originalFile for read-only documents whose bytes must survive export: native export can remove encryption and invalidates signatures. */
export function ExportAPIBridge({
  disabled = false,
  originalFile,
  sourceFile,
}: {
  disabled?: boolean;
  originalFile?: Blob;
  sourceFile?: Blob;
}) {
  const { provides: exportApi } = useExportCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();
  // Read at save time: FileContext hands out new File objects for the same bytes.
  const sourceFileRef = useRef(sourceFile);
  useLayoutEffect(() => {
    sourceFileRef.current = sourceFile;
  }, [sourceFile]);

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
          : keepingSourceVersion(exportApi!, () => sourceFileRef.current),
      });
    }

    return () => {
      registerBridge("export", null);
    };
  }, [exportApi, documentReady, registerBridge, disabled, originalFile]);

  return null;
}
