import {
  createBitmapImageObject,
  decodeImageDataUrl,
  type DecodedImage,
} from "@app/utils/pdfiumBitmapUtils";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
  readEffectivePageBox,
  saveRawDocument,
} from "@app/services/pdfiumService";
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
            const sessionAnnotations = pageAnnotations.filter((annotation) =>
              Boolean(getAnnotationImageData(annotation, getImageData)),
            );

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

      // Step 4: Add signatures as locked, printable PDFium stamp annotations.
      // FPDFAnnot_AppendObject creates the annotation appearance without asking
      // PDFium to regenerate the page's existing content. GenerateContent would
      // corrupt some Type3/vector content, including the issue #7083 logo.
      if (allAnnotations.length > 0) {
        try {
          const resultBytes = await embedSignatureImages(
            await signedFile.arrayBuffer(),
            allAnnotations,
            getImageData,
          );
          signedFile = new File([resultBytes as BlobPart], currentFile.name, {
            type: "application/pdf",
          });
        } catch (renderError) {
          console.error("Failed to embed signature images:", renderError);
          console.warn("Signatures may only remain as annotations");
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

type SignatureAnnotationsByPage = Array<{
  pageIndex: number;
  annotations: any[];
}>;

function extractImageDataUrl(
  value: unknown,
  depth = 0,
  visited: Set<unknown> = new Set(),
): string | undefined {
  if (!value || depth > 6) return undefined;

  if (typeof value === "string") {
    return value.startsWith("data:image") ? value : undefined;
  }

  if (typeof value !== "object" || visited.has(value)) return undefined;
  visited.add(value);

  const entries = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  for (const entry of entries) {
    const imageDataUrl = extractImageDataUrl(entry, depth + 1, visited);
    if (imageDataUrl) return imageDataUrl;
  }

  return undefined;
}

function getAnnotationImageData(
  annotation: any,
  getImageData: (id: string) => string | undefined,
): string | undefined {
  // EmbedPDF can replace fields such as imageData/appearance with an internal
  // asset reference after placement. Prefer our persistent original and only
  // accept values that actually contain an image data URL.
  const candidates: unknown[] = [
    annotation.id ? getImageData(annotation.id) : undefined,
    annotation.imageSrc,
    annotation.imageData,
    annotation.appearance,
    annotation.stampData,
    annotation.contents,
    annotation.data,
    annotation.customData,
    annotation.asset,
  ];

  for (const candidate of candidates) {
    const imageDataUrl = extractImageDataUrl(candidate);
    if (imageDataUrl) return imageDataUrl;
  }

  return undefined;
}

export async function embedSignatureImages(
  pdfArrayBuffer: ArrayBuffer,
  annotationsByPage: SignatureAnnotationsByPage,
  getImageData: (id: string) => string | undefined,
  imageDecoder: (
    dataUrl: string,
  ) => Promise<DecodedImage | null> = decodeImageDataUrl,
): Promise<ArrayBuffer> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(pdfArrayBuffer);

  try {
    const pageCount = m.FPDF_GetPageCount(docPtr);

    for (const { pageIndex, annotations } of annotationsByPage) {
      if (pageIndex < 0 || pageIndex >= pageCount) continue;

      const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
      if (!pagePtr) continue;

      try {
        const pageBox = readEffectivePageBox(m, pagePtr);
        const cropHeight = pageBox.top - pageBox.bottom;

        for (const annotation of annotations) {
          const rect =
            annotation.rect ??
            annotation.bounds ??
            annotation.rectangle ??
            annotation.position;
          if (!rect) continue;

          const originalX = rect.origin?.x ?? rect.x ?? rect.left ?? 0;
          const originalY = rect.origin?.y ?? rect.y ?? rect.top ?? 0;
          const width = rect.size?.width ?? rect.width ?? 100;
          const height = rect.size?.height ?? rect.height ?? 50;
          if (width <= 0 || height <= 0) continue;

          let imageDataUrl = getAnnotationImageData(annotation, getImageData);
          if (!imageDataUrl) continue;

          if (imageDataUrl.startsWith("data:image/svg+xml")) {
            const pngBytes = await rasteriseSvgToPng(
              imageDataUrl,
              width * 2,
              height * 2,
            );
            if (!pngBytes) continue;
            imageDataUrl = `data:image/png;base64,${uint8ArrayToBase64(pngBytes)}`;
          }

          const decodedImage = await imageDecoder(imageDataUrl);
          if (!decodedImage) continue;

          const pdfX = pageBox.left + originalX;
          const pdfY = pageBox.bottom + cropHeight - originalY - height;
          appendStampAnnotation(
            m,
            docPtr,
            pagePtr,
            decodedImage,
            pdfX,
            pdfY,
            width,
            height,
          );
        }
      } finally {
        m.FPDF_ClosePage(pagePtr);
      }
    }

    return await saveRawDocument(docPtr);
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

const FPDF_ANNOT_STAMP = 13;
const FPDF_ANNOT_FLAG_PRINT = 1 << 2;
const FPDF_ANNOT_FLAG_READONLY = 1 << 6;
const FPDF_ANNOT_FLAG_LOCKED = 1 << 7;

function appendStampAnnotation(
  m: Awaited<ReturnType<typeof getPdfiumModule>>,
  docPtr: number,
  pagePtr: number,
  image: DecodedImage,
  pdfX: number,
  pdfY: number,
  width: number,
  height: number,
): boolean {
  const annotationIndex = m.FPDFPage_GetAnnotCount(pagePtr);
  const annotPtr = m.FPDFPage_CreateAnnot(pagePtr, FPDF_ANNOT_STAMP);
  if (!annotPtr) return false;

  let appended = false;
  let imageObjPtr = 0;
  const rectPtr = m.pdfium.wasmExports.malloc(4 * 4);

  try {
    // FS_RECTF layout: left, top, right, bottom.
    m.pdfium.setValue(rectPtr, pdfX, "float");
    m.pdfium.setValue(rectPtr + 4, pdfY + height, "float");
    m.pdfium.setValue(rectPtr + 8, pdfX + width, "float");
    m.pdfium.setValue(rectPtr + 12, pdfY, "float");
    if (!m.FPDFAnnot_SetRect(annotPtr, rectPtr)) return false;

    imageObjPtr =
      createBitmapImageObject(
        m,
        docPtr,
        pagePtr,
        image,
        pdfX,
        pdfY,
        width,
        height,
      ) ?? 0;
    if (!imageObjPtr) return false;

    if (!m.FPDFAnnot_AppendObject(annotPtr, imageObjPtr)) return false;
    imageObjPtr = 0; // The annotation owns the object after a successful append.

    m.FPDFAnnot_SetFlags(
      annotPtr,
      FPDF_ANNOT_FLAG_PRINT | FPDF_ANNOT_FLAG_READONLY | FPDF_ANNOT_FLAG_LOCKED,
    );
    appended = true;
    return true;
  } finally {
    m.pdfium.wasmExports.free(rectPtr);
    if (imageObjPtr) m.FPDFPageObj_Destroy(imageObjPtr);
    m.FPDFPage_CloseAnnot(annotPtr);
    if (!appended) m.FPDFPage_RemoveAnnot(pagePtr, annotationIndex);
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
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
