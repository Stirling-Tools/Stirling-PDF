import {PDFDocument, rgb} from '@cantoo/pdf-lib';
import {PdfAnnotationSubtype} from '@embedpdf/models';
import {generateThumbnailWithMetadata} from '@app/utils/thumbnailUtils';
import {createChildStub, createProcessedFile} from '@app/contexts/file/fileActions';
import {createStirlingFile, FileId, StirlingFile, StirlingFileStub} from '@app/types/fileContext';
import type {SignatureAPI} from '@app/components/viewer/viewerTypes';

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

export async function flattenSignatures(options: SignatureFlatteningOptions): Promise<SignatureFlatteningResult | null> {
  const { signatureApiRef, getImageData, exportActions, selectors, originalFile, getScrollState, activeFileIndex } = options;

  try {
    // Step 1: Extract all annotations from EmbedPDF before export
    const allAnnotations: Array<{pageIndex: number, annotations: any[]}> = [];

    if (signatureApiRef?.current) {

      const scrollState = getScrollState();
      const totalPages = scrollState.totalPages;

      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        try {
          const pageAnnotations = await signatureApiRef.current.getPageAnnotations(pageIndex);
          if (pageAnnotations && pageAnnotations.length > 0) {
            const sessionAnnotations = pageAnnotations.filter(annotation => {
              const hasStoredImageData = annotation.id && getImageData(annotation.id);

              const hasDirectImageData = annotation.imageData || annotation.appearance ||
                                       annotation.stampData || annotation.imageSrc ||
                                       annotation.contents || annotation.data;
              return hasStoredImageData || (hasDirectImageData && typeof hasDirectImageData === 'string' && hasDirectImageData.startsWith('data:image'));
            });

            if (sessionAnnotations.length > 0) {
              allAnnotations.push({pageIndex, annotations: sessionAnnotations});
            }
          }
        } catch (pageError) {
          console.warn(`Error extracting annotations from page ${pageIndex + 1}:`, pageError);
        }
      }
    }

    // Step 2: Delete ONLY session annotations from EmbedPDF before export (they'll be rendered manually)
    if (allAnnotations.length > 0 && signatureApiRef?.current) {
      for (const pageData of allAnnotations) {
        for (const annotation of pageData.annotations) {
          try {
            signatureApiRef.current.deleteAnnotation(annotation.id, pageData.pageIndex);
          } catch (deleteError) {
            console.warn(`Failed to delete annotation ${annotation.id}:`, deleteError);
          }
        }
      }
    }

    // Step 3: Use EmbedPDF's saveAsCopy to get the original PDF (now without annotations)
    if (!exportActions) {
      console.error('No export actions available');
      return null;
    }
    const pdfArrayBuffer = await exportActions.saveAsCopy();

    if (pdfArrayBuffer) {

      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

      let currentFile = originalFile;
      if (!currentFile) {
        const allFileIds = selectors.getAllFileIds();
        if (allFileIds.length > 0) {
          const fileIndex = activeFileIndex !== undefined && activeFileIndex < allFileIds.length ? activeFileIndex : 0;
          const fileStub = selectors.getStirlingFileStub(allFileIds[fileIndex]);
          const fileObject = selectors.getFile(allFileIds[fileIndex]);
          if (fileStub && fileObject) {
            currentFile = createStirlingFile(fileObject, allFileIds[fileIndex] as FileId);
          }
        }
      }

      if (!currentFile) {
        console.error('No file available to replace');
        return null;
      }

      let signedFile = new File([blob], currentFile.name, { type: 'application/pdf' });

      // Step 4: Manually render extracted annotations onto the PDF using PDF-lib
      if (allAnnotations.length > 0) {
        try {
          const pdfArrayBufferForFlattening = await signedFile.arrayBuffer();

          let pdfDoc: PDFDocument;
          try {
            pdfDoc = await PDFDocument.load(pdfArrayBufferForFlattening, {
              ignoreEncryption: true,
              capNumbers: false,
              throwOnInvalidObject: false
            });
          } catch {
            console.warn('Failed to load with standard options, trying createProxy...');
            try {
              pdfDoc = await PDFDocument.create();
              const sourcePdf = await PDFDocument.load(pdfArrayBufferForFlattening, {
                ignoreEncryption: true,
                throwOnInvalidObject: false
              });
              const pageIndices = sourcePdf.getPages().map((_, i) => i);
              const copiedPages = await pdfDoc.copyPages(sourcePdf, pageIndices);
              copiedPages.forEach(page => pdfDoc.addPage(page));
            } catch (copyError) {
              console.error('Failed to load PDF with any method:', copyError);
              throw copyError;
            }
          }

          const pages = pdfDoc.getPages();

          for (const pageData of allAnnotations) {
            const { pageIndex, annotations } = pageData;

            if (pageIndex < pages.length) {
              const page = pages[pageIndex];
              const { height: pageHeight } = page.getSize();

              for (const annotation of annotations) {
                try {

                  const rect = annotation.rect || annotation.bounds || annotation.rectangle || annotation.position;

                  if (rect) {
                    const originalX = rect.origin?.x || rect.x || rect.left || 0;
                    const originalY = rect.origin?.y || rect.y || rect.top || 0;
                    const width = rect.size?.width || rect.width || 100;
                    const height = rect.size?.height || rect.height || 50;

                    const pdfX = originalX;
                    const pdfY = pageHeight - originalY - height;


                    let imageDataUrl = annotation.imageData || annotation.appearance || annotation.stampData ||
                                     annotation.imageSrc || annotation.contents || annotation.data;

                    if (!imageDataUrl && annotation.id) {
                      const storedImageData = getImageData(annotation.id);
                      if (storedImageData) {
                        imageDataUrl = storedImageData;
                      }
                    }

                    if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/svg+xml')) {
                      let svgRendered = false;
                      try {
                        const svgContent = decodeSvgDataUrl(imageDataUrl);
                        if (svgContent && typeof (page as any).drawSvg === 'function') {
                          // drawSvg from @cantoo/pdf-lib renders SVG natively as
                          (page as any).drawSvg(svgContent, {
                            x: pdfX,
                            y: pdfY,
                            width: width,
                            height: height,
                          });
                          svgRendered = true;
                        }
                      } catch (svgError) {
                        console.warn('Native SVG embed failed, falling back to raster:', svgError);
                      }

                      if (!svgRendered) {
                        try {
                          const pngBytes = await rasteriseSvgToPng(imageDataUrl, width * 2, height * 2);
                          if (pngBytes) {
                            const image = await pdfDoc.embedPng(pngBytes);
                            page.drawImage(image, { x: pdfX, y: pdfY, width, height });
                            svgRendered = true;
                          }
                        } catch (rasterError) {
                          console.error('SVG raster fallback also failed:', rasterError);
                        }
                      }

                      if (!svgRendered) {
                        page.drawRectangle({
                          x: pdfX,
                          y: pdfY,
                          width: width,
                          height: height,
                          borderColor: rgb(0.8, 0, 0),
                          borderWidth: 1,
                          color: rgb(1, 0.95, 0.95),
                          opacity: 0.7,
                        });
                      }
                    } else if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
                      try {
                        const base64Data = imageDataUrl.split(',')[1];
                        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                        let image;
                        if (imageDataUrl.includes('data:image/jpeg') || imageDataUrl.includes('data:image/jpg')) {
                          image = await pdfDoc.embedJpg(imageBytes);
                        } else if (imageDataUrl.includes('data:image/png')) {
                          image = await pdfDoc.embedPng(imageBytes);
                        } else {
                          image = await pdfDoc.embedPng(imageBytes);
                        }

                        page.drawImage(image, {
                          x: pdfX,
                          y: pdfY,
                          width: width,
                          height: height,
                        });

                      } catch (imageError) {
                        console.error('Failed to render image annotation:', imageError);
                      }
                    } else if (annotation.content || annotation.text) {
                      page.drawText(annotation.content || annotation.text, {
                        x: pdfX,
                        y: pdfY + height - 12, // Adjust for text baseline
                        size: 12,
                        color: rgb(0, 0, 0)
                      });
                    } else if (annotation.type === PdfAnnotationSubtype.INK || annotation.type === PdfAnnotationSubtype.LINE) {
                      page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: width,
                        height: height,
                        borderColor: rgb(0, 0, 0),
                        borderWidth: 1,
                        color: rgb(0.95, 0.95, 0.95),
                        opacity: 0.6
                      });
                    } else {
                      page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: width,
                        height: height,
                        borderColor: rgb(1, 0, 0),
                        borderWidth: 2,
                        color: rgb(1, 1, 0),
                        opacity: 0.5
                      });
                    }
                  }
                } catch (annotationError) {
                  console.warn('Failed to render annotation:', annotationError);
                }
              }
            }
          }


          const flattenedPdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });

          const arrayBuffer = new ArrayBuffer(flattenedPdfBytes.length);
          const uint8View = new Uint8Array(arrayBuffer);
          uint8View.set(flattenedPdfBytes);
          signedFile = new File([arrayBuffer], currentFile.name, { type: 'application/pdf' });

        } catch (renderError) {
          console.error('Failed to manually render annotations:', renderError);
          console.warn('Signatures may only show as annotations');
        }
      }

      const thumbnailResult = await generateThumbnailWithMetadata(signedFile);
      const processedFileMetadata = createProcessedFile(thumbnailResult.pageCount, thumbnailResult.thumbnail);

      const inputFileIds: FileId[] = [currentFile.fileId];

      const record = selectors.getStirlingFileStub(currentFile.fileId);
      if (!record) {
        console.error('No file record found for:', currentFile.fileId);
        return null;
      }

      const outputStub = createChildStub(
        record,
        { toolId: 'sign', timestamp: Date.now() },
        signedFile,
        thumbnailResult.thumbnail,
        processedFileMetadata
      );
      const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

      return {
        inputFileIds,
        outputStirlingFile,
        outputStub
      };
    }

    return null;
  } catch (error) {
    console.error('Error flattening signatures:', error);
    return null;
  }
}

/**
 * Decode an SVG data URL to its raw XML string.
 * Handles both base64-encoded and URI-encoded SVG data URLs.
 */
function decodeSvgDataUrl(dataUrl: string): string | null {
  try {
    if (dataUrl.includes(';base64,')) {
      const base64 = dataUrl.split(',')[1];
      return atob(base64);
    }
    // URI-encoded SVG
    const encoded = dataUrl.split(',')[1];
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * Rasterise an SVG data URL to PNG bytes via an offscreen canvas.
 * Used as a fallback when native SVG embedding is unavailable.
 */
function rasteriseSvgToPng(svgDataUrl: string, width: number, height: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            blob.arrayBuffer().then(
              (buf) => resolve(new Uint8Array(buf)),
              () => resolve(null),
            );
          },
          'image/png',
        );
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}
