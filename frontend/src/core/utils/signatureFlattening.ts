import { PDFDocument, rgb } from 'pdf-lib';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { generateThumbnailWithMetadata } from '@app/utils/thumbnailUtils';
import { createProcessedFile, createChildStub } from '@app/contexts/file/fileActions';
import { createStirlingFile, StirlingFile, FileId, StirlingFileStub } from '@app/types/fileContext';
import type { SignatureAPI } from '@app/components/viewer/viewerTypes';

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

      // Get actual page count from viewer
      const scrollState = getScrollState();
      const totalPages = scrollState.totalPages;

      // Check only actual pages that exist in the document
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        try {
          const pageAnnotations = await signatureApiRef.current.getPageAnnotations(pageIndex);
          if (pageAnnotations && pageAnnotations.length > 0) {
            // Filter to only include annotations added in this session
            const sessionAnnotations = pageAnnotations.filter(annotation => {
              // Check if this annotation has stored image data (indicates it was added this session)
              const hasStoredImageData = annotation.id && getImageData(annotation.id);

              // Also check if it has image data directly in the annotation (new signatures)
              const hasDirectImageData = annotation.imageData || annotation.appearance ||
                                       annotation.stampData || annotation.imageSrc ||
                                       annotation.contents || annotation.data;

              const isSessionAnnotation = hasStoredImageData || (hasDirectImageData && typeof hasDirectImageData === 'string' && hasDirectImageData.startsWith('data:image'));


              return isSessionAnnotation;
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
    // Leave old annotations alone - they will remain as annotations in the PDF
    if (allAnnotations.length > 0 && signatureApiRef?.current) {
      for (const pageData of allAnnotations) {
        for (const annotation of pageData.annotations) {
          try {
            await signatureApiRef.current.deleteAnnotation(annotation.id, pageData.pageIndex);
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

      // Try loading with more permissive PDF-lib options

      // Convert ArrayBuffer to File
      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

      // Get the current file - try from originalFile first, then from all files
      let currentFile = originalFile;
      if (!currentFile) {
        const allFileIds = selectors.getAllFileIds();
        if (allFileIds.length > 0) {
          // Use activeFileIndex if provided, otherwise default to 0
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

          // Try different loading options to handle problematic PDFs
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
              // Create a fresh PDF and copy pages instead of modifying
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
                    // Extract original annotation position and size
                    const originalX = rect.origin?.x || rect.x || rect.left || 0;
                    const originalY = rect.origin?.y || rect.y || rect.top || 0;
                    const width = rect.size?.width || rect.width || 100;
                    const height = rect.size?.height || rect.height || 50;

                    // Convert EmbedPDF coordinates to PDF-lib coordinates
                    const pdfX = originalX;
                    const pdfY = pageHeight - originalY - height;


                    // Try to get annotation image data
                    let imageDataUrl = annotation.imageData || annotation.appearance || annotation.stampData ||
                                     annotation.imageSrc || annotation.contents || annotation.data;

                    // If no image data found directly, try to get it from storage
                    if (!imageDataUrl && annotation.id) {
                      const storedImageData = getImageData(annotation.id);
                      if (storedImageData) {
                        imageDataUrl = storedImageData;
                      }
                    }

                    if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
                      try {
                        // Convert data URL to bytes
                        const base64Data = imageDataUrl.split(',')[1];
                        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                        // Embed image in PDF based on data URL type
                        let image;
                        if (imageDataUrl.includes('data:image/jpeg') || imageDataUrl.includes('data:image/jpg')) {
                          image = await pdfDoc.embedJpg(imageBytes);
                        } else if (imageDataUrl.includes('data:image/png')) {
                          image = await pdfDoc.embedPng(imageBytes);
                        } else {
                          // Default to PNG for other formats (including converted SVGs)
                          image = await pdfDoc.embedPng(imageBytes);
                        }

                        // Draw image on page at annotation position
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
                      console.warn('Rendering text annotation instead');
                      // Handle text annotations
                      page.drawText(annotation.content || annotation.text, {
                        x: pdfX,
                        y: pdfY + height - 12, // Adjust for text baseline
                        size: 12,
                        color: rgb(0, 0, 0)
                      });
                    } else if (annotation.type === PdfAnnotationSubtype.INK || annotation.type === PdfAnnotationSubtype.LINE) {
                      // Handle ink annotations (drawn signatures)
                      page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: width,
                        height: height,
                        borderColor: rgb(0, 0, 0),
                        borderWidth: 2,
                        color: rgb(0.9, 0.9, 0.9), // Light gray background
                        opacity: 0.8
                      });

                      page.drawText('Drawn Signature', {
                        x: pdfX + 5,
                        y: pdfY + height / 2,
                        size: 10,
                        color: rgb(0, 0, 0)
                      });
                    } else {
                      // Handle other annotation types
                      page.drawRectangle({
                        x: pdfX,
                        y: pdfY,
                        width: width,
                        height: height,
                        borderColor: rgb(1, 0, 0),
                        borderWidth: 2,
                        color: rgb(1, 1, 0), // Yellow background
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


          // Save the PDF with rendered annotations
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

      // Generate thumbnail and metadata for the signed file
      const thumbnailResult = await generateThumbnailWithMetadata(signedFile);
      const processedFileMetadata = createProcessedFile(thumbnailResult.pageCount, thumbnailResult.thumbnail);

      // Prepare input file data for replacement
      const inputFileIds: FileId[] = [currentFile.fileId];

      const record = selectors.getStirlingFileStub(currentFile.fileId);
      if (!record) {
        console.error('No file record found for:', currentFile.fileId);
        return null;
      }

      // Create output stub and file as a child of the original (increments version)
      const outputStub = createChildStub(
        record,
        { toolId: 'sign', timestamp: Date.now() },
        signedFile,
        thumbnailResult.thumbnail,
        processedFileMetadata
      );
      const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

      // Return the flattened file data for consumption by caller
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
