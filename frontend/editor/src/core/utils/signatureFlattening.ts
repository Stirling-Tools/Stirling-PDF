// PDFium annotation subtype constants
import {
  FPDF_ANNOT_INK,
  FPDF_ANNOT_LINE,
  embedBitmapImageOnPage,
  drawPlaceholderRect,
  decodeImageDataUrl,
} from "@app/utils/pdfiumBitmapUtils";
import { generateThumbnailWithMetadata } from "@app/utils/thumbnailUtils";
import {
  createChildStub,
  createProcessedFile,
} from "@app/contexts/file/fileActions";
import {
  createStirlingFile,
  FileId,
  StirlingFile,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { SignatureAPI } from "@app/components/viewer/viewerTypes";
import {
  getPdfiumModule,
  openRawDocumentSafe,
  closeDocAndFreeBuffer,
  saveRawDocument,
} from "@app/services/pdfiumService";

interface MinimalFileContextSelectors {
  getAllFileIds: () => FileId[];
  getStirlingFileStub: (id: FileId) => StirlingFileStub | undefined;
  getFile: (id: FileId) => StirlingFile | undefined;
}

interface SignatureFlatteningOptions {
  signatureApiRef: React.RefObject<SignatureAPI | null>;
  getImageData: (id: string) => string | undefined;
  exportActions?: {
    saveAsCopy: () => Promise<ArrayBuffer | null>;
  };
  selectors: MinimalFileContextSelectors;
  originalFile?: StirlingFile;
  getScrollState: () => { currentPage: number; totalPages: number };
  activeFileIndex?: number;
}

export interface SignatureFlatteningResult {
  inputFileIds: FileId[];
  outputStirlingFile: StirlingFile;
  outputStub: StirlingFileStub;
}

export async function flattenSignatures(
  options: SignatureFlatteningOptions,
): Promise<SignatureFlatteningResult | null> {
  const {
    signatureApiRef,
    getImageData,
    exportActions,
    selectors,
    originalFile,
    getScrollState,
    activeFileIndex,
  } = options;

  try {
    // Step 1: Extract all annotations from EmbedPDF before export
    const allAnnotations: Array<{ pageIndex: number; annotations: any[] }> = [];

    if (signatureApiRef?.current) {
      const scrollState = getScrollState();
      const totalPages = scrollState.totalPages;

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        try {
          const pageAnnotations =
            await signatureApiRef.current.getPageAnnotations(pageIndex);
          if (pageAnnotations && pageAnnotations.length > 0) {
            const sessionAnnotations = pageAnnotations.filter((annotation) => {
              const hasStoredImageData =
                annotation.id && getImageData(annotation.id);
              const hasDirectImageData =
                annotation.imageData ||
                annotation.appearance ||
                annotation.stampData ||
                annotation.imageSrc ||
                annotation.contents ||
                annotation.data;
              return (
                hasStoredImageData ||
                (hasDirectImageData &&
                  typeof hasDirectImageData === "string" &&
                  hasDirectImageData.startsWith("data:image"))
              );
            });

            if (sessionAnnotations.length > 0) {
              allAnnotations.push({
                pageIndex,
                annotations: sessionAnnotations,
              });
            }
          }
        } catch (pageError) {
          console.warn(
            `Error extracting annotations from page ${pageIndex + 1}:`,
            pageError,
          );
        }
      }
    }

    // Step 2: Delete ONLY session annotations from EmbedPDF before export
    if (allAnnotations.length > 0 && signatureApiRef?.current) {
      for (const pageData of allAnnotations) {
        for (const annotation of pageData.annotations) {
          try {
            signatureApiRef.current.deleteAnnotation(
              annotation.id,
              pageData.pageIndex,
            );
          } catch (deleteError) {
            console.warn(
              `Failed to delete annotation ${annotation.id}:`,
              deleteError,
            );
          }
        }
      }
    }

    // Step 3: Use EmbedPDF's saveAsCopy to get the original PDF
    if (!exportActions) {
      console.error("No export actions available");
      return null;
    }
    const pdfArrayBuffer = await exportActions.saveAsCopy();

    if (pdfArrayBuffer) {
      const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

      let currentFile = originalFile;
      if (!currentFile) {
        const allFileIds = selectors.getAllFileIds();
        if (allFileIds.length > 0) {
          const fileIndex =
            activeFileIndex !== undefined && activeFileIndex < allFileIds.length
              ? activeFileIndex
              : 0;
          const fileStub = selectors.getStirlingFileStub(allFileIds[fileIndex]);
          const fileObject = selectors.getFile(allFileIds[fileIndex]);
          if (fileStub && fileObject) {
            currentFile = createStirlingFile(
              fileObject,
              allFileIds[fileIndex] as FileId,
            );
          }
        }
      }

      if (!currentFile) {
        console.error("No file available to replace");
        return null;
      }

      let signedFile = new File([blob], currentFile.name, {
        type: "application/pdf",
      });

      // Step 4: Manually render extracted annotations onto the PDF using PDFium WASM
      if (allAnnotations.length > 0) {
        try {
          const pdfArrayBufferForFlattening = await signedFile.arrayBuffer();
          const m = await getPdfiumModule();
          const docPtr = await openRawDocumentSafe(pdfArrayBufferForFlattening);

          try {
            const pageCount = m.FPDF_GetPageCount(docPtr);

            for (const pageData of allAnnotations) {
              const { pageIndex, annotations } = pageData;

              if (pageIndex < pageCount) {
                const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
                if (!pagePtr) continue;

                const pageHeight = m.FPDF_GetPageHeightF(pagePtr);

                for (const annotation of annotations) {
                  try {
                    const rect =
                      annotation.rect ||
                      annotation.bounds ||
                      annotation.rectangle ||
                      annotation.position;

                    if (rect) {
                      const originalX =
                        rect.origin?.x || rect.x || rect.left || 0;
                      const originalY =
                        rect.origin?.y || rect.y || rect.top || 0;
                      const width = rect.size?.width || rect.width || 100;
                      const height = rect.size?.height || rect.height || 50;

                      // Convert from CSS top-left to PDF bottom-left
                      const pdfX = originalX;
                      const pdfY = pageHeight - originalY - height;

                      let imageDataUrl =
                        annotation.imageData ||
                        annotation.appearance ||
                        annotation.stampData ||
                        annotation.imageSrc ||
                        annotation.contents ||
                        annotation.data;

                      if (!imageDataUrl && annotation.id) {
                        const storedImageData = getImageData(annotation.id);
                        if (storedImageData) {
                          imageDataUrl = storedImageData;
                        }
                      }

                      // Convert SVG to PNG first if needed
                      if (
                        imageDataUrl &&
                        typeof imageDataUrl === "string" &&
                        imageDataUrl.startsWith("data:image/svg+xml")
                      ) {
                        const pngBytes = await rasteriseSvgToPng(
                          imageDataUrl,
                          width * 2,
                          height * 2,
                        );
                        if (pngBytes) {
                          imageDataUrl = await uint8ArrayToPngDataUrl(pngBytes);
                        } else {
                          drawPlaceholderRect(
                            m,
                            pagePtr,
                            pdfX,
                            pdfY,
                            width,
                            height,
                          );
                          continue;
                        }
                      }

                      if (
                        imageDataUrl &&
                        typeof imageDataUrl === "string" &&
                        imageDataUrl.startsWith("data:image")
                      ) {
                        // Decode the image data URL to raw pixels via canvas
                        const imageResult =
                          await decodeImageDataUrl(imageDataUrl);
                        if (imageResult) {
                          embedBitmapImageOnPage(
                            m,
                            docPtr,
                            pagePtr,
                            imageResult,
                            pdfX,
                            pdfY,
                            width,
                            height,
                          );
                        }
                      } else if (
                        annotation.type === FPDF_ANNOT_INK ||
                        annotation.type === FPDF_ANNOT_LINE
                      ) {
                        drawPlaceholderRect(
                          m,
                          pagePtr,
                          pdfX,
                          pdfY,
                          width,
                          height,
                        );
                      }
                    }
                  } catch (annotationError) {
                    console.warn(
                      "Failed to render annotation:",
                      annotationError,
                    );
                  }
                }

                m.FPDFPage_GenerateContent(pagePtr);
                m.FPDF_ClosePage(pagePtr);
              }
            }

            const resultBuf = await saveRawDocument(docPtr);
            signedFile = new File([resultBuf], currentFile.name, {
              type: "application/pdf",
            });
          } finally {
            closeDocAndFreeBuffer(m, docPtr);
          }
        } catch (renderError) {
          console.error("Failed to manually render annotations:", renderError);
          console.warn("Signatures may only show as annotations");
        }
      }

      const thumbnailResult = await generateThumbnailWithMetadata(signedFile);
      const processedFileMetadata = createProcessedFile(
        thumbnailResult.pageCount,
        thumbnailResult.thumbnail,
      );

      const inputFileIds: FileId[] = [currentFile.fileId];

      const record = selectors.getStirlingFileStub(currentFile.fileId);
      if (!record) {
        console.error("No file record found for:", currentFile.fileId);
        return null;
      }

      const outputStub = createChildStub(
        record,
        { toolId: "sign", timestamp: Date.now() },
        signedFile,
        thumbnailResult.thumbnail,
        processedFileMetadata,
      );
      const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

      return {
        inputFileIds,
        outputStirlingFile,
        outputStub,
      };
    }

    return null;
  } catch (error) {
    console.error("Error flattening signatures:", error);
    return null;
  }
}

/**
 * Convert Uint8Array PNG bytes to a data URL for canvas decoding.
 */
function uint8ArrayToPngDataUrl(pngBytes: Uint8Array): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([pngBytes as BlobPart], { type: "image/png" });
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Rasterise an SVG data URL to PNG bytes via an offscreen canvas.
 */
function rasteriseSvgToPng(
  svgDataUrl: string,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          blob.arrayBuffer().then(
            (buf) => resolve(new Uint8Array(buf)),
            () => resolve(null),
          );
        }, "image/png");
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}
