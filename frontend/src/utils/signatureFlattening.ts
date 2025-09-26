import { PDFDocument, rgb } from 'pdf-lib';
import { generateThumbnailWithMetadata } from './thumbnailUtils';
import { createProcessedFile } from '../contexts/file/fileActions';
import { createNewStirlingFileStub, createStirlingFile, StirlingFile, FileId, StirlingFileStub } from '../types/fileContext';
import type { SignatureAPI } from '../components/viewer/SignatureAPIBridge';

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
  consumeFiles: (inputFileIds: FileId[], outputStirlingFiles: StirlingFile[], outputStirlingFileStubs: StirlingFileStub[]) => Promise<FileId[]>;
  originalFile?: StirlingFile;
}

export async function flattenSignatures(options: SignatureFlatteningOptions): Promise<boolean> {
  const { signatureApiRef, getImageData, exportActions, selectors, consumeFiles, originalFile } = options;

  try {
    // Step 1: Extract all annotations from EmbedPDF before export
    const allAnnotations: Array<{pageIndex: number, annotations: any[]}> = [];

    if (signatureApiRef?.current) {
      console.log('Extracting annotations from all pages...');

      // Dynamically check all pages until we encounter consecutive errors
      let pageIndex = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3; // Stop after 3 consecutive page access failures

      while (consecutiveErrors < maxConsecutiveErrors) {
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

              if (isSessionAnnotation) {
                console.log(`Including session annotation ${annotation.id} from page ${pageIndex + 1}`);
              } else {
                console.log(`Skipping existing annotation ${annotation.id} from page ${pageIndex + 1} (not added in this session)`);
              }

              return isSessionAnnotation;
            });

            if (sessionAnnotations.length > 0) {
              allAnnotations.push({pageIndex, annotations: sessionAnnotations});
              console.log(`Found ${sessionAnnotations.length} session annotations on page ${pageIndex + 1} (out of ${pageAnnotations.length} total)`);
            }
          }

          // Reset consecutive error count on successful page access
          consecutiveErrors = 0;
        } catch (pageError) {
          consecutiveErrors++;
          console.warn(`Error extracting annotations from page ${pageIndex + 1} (error ${consecutiveErrors}/${maxConsecutiveErrors}):`, pageError);
        }

        pageIndex++;
      }
    }

    console.log(`Total annotations found: ${allAnnotations.reduce((sum, page) => sum + page.annotations.length, 0)}`);

    // Step 2: Delete ONLY session annotations from EmbedPDF before export (they'll be rendered manually)
    // Leave old annotations alone - they will remain as annotations in the PDF
    if (allAnnotations.length > 0 && signatureApiRef?.current) {
      console.log('Deleting session annotations from EmbedPDF before export...');
      for (const pageData of allAnnotations) {
        for (const annotation of pageData.annotations) {
          try {
            await signatureApiRef.current.deleteAnnotation(annotation.id, pageData.pageIndex);
            console.log(`Deleted session annotation ${annotation.id} from page ${pageData.pageIndex}`);
          } catch (deleteError) {
            console.warn(`Failed to delete annotation ${annotation.id}:`, deleteError);
          }
        }
      }
    }

    // Step 3: Use EmbedPDF's saveAsCopy to get the base PDF (now without annotations)
    if (!exportActions) {
      console.error('No export actions available');
      return false;
    }
    const pdfArrayBuffer = await exportActions.saveAsCopy();

    if (pdfArrayBuffer) {
      console.log(`EmbedPDF exported PDF size: ${pdfArrayBuffer.byteLength} bytes`);

      // Try loading with more permissive PDF-lib options
      console.log('Attempting to load PDF with PDF-lib...');

      // Convert ArrayBuffer to File
      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

      // Get the current file - try from originalFile first, then from all files
      let currentFile = originalFile;
      if (!currentFile) {
        const allFileIds = selectors.getAllFileIds();
        if (allFileIds.length > 0) {
          const fileStub = selectors.getStirlingFileStub(allFileIds[0]);
          const fileObject = selectors.getFile(allFileIds[0]);
          if (fileStub && fileObject) {
            currentFile = createStirlingFile(fileObject, allFileIds[0] as FileId);
          }
        }
      }

      if (!currentFile) {
        console.error('No file available to replace');
        return false;
      }

      let signedFile = new File([blob], currentFile.name, { type: 'application/pdf' });

      // Step 4: Manually render extracted annotations onto the PDF using PDF-lib
      if (allAnnotations.length > 0) {
        try {
          console.log('Manually rendering annotations onto PDF...');
          const pdfArrayBufferForFlattening = await signedFile.arrayBuffer();

          // Try different loading options to handle problematic PDFs
          let pdfDoc: PDFDocument;
          try {
            pdfDoc = await PDFDocument.load(pdfArrayBufferForFlattening, {
              ignoreEncryption: true,
              capNumbers: false,
              throwOnInvalidObject: false
            });
            console.log('✓ PDF loaded successfully with standard options');
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
              console.log('✓ PDF loaded by creating new document and copying pages');
            } catch (copyError) {
              console.error('Failed to load PDF with any method:', copyError);
              throw copyError;
            }
          }

          const pages = pdfDoc.getPages();
          console.log(`PDF has ${pages.length} pages`);

          let totalRendered = 0;

          for (const pageData of allAnnotations) {
            const { pageIndex, annotations } = pageData;

            if (pageIndex < pages.length) {
              const page = pages[pageIndex];
              const { width: pageWidth, height: pageHeight } = page.getSize();

              for (const annotation of annotations) {
                try {
                  console.log('Processing annotation:', annotation);

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

                    console.log('Signature positioning:', {
                      originalX, originalY, width, height, pdfX, pdfY, pageWidth, pageHeight
                    });

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
                          image = await pdfDoc.embedPng(imageBytes);
                        }

                        // Draw image on page at annotation position
                        page.drawImage(image, {
                          x: pdfX,
                          y: pdfY,
                          width: width,
                          height: height,
                        });

                        totalRendered++;
                        console.log(`✓ SUCCESS: Rendered image annotation at (${pdfX}, ${pdfY}) size (${width}x${height})`);
                      } catch (imageError) {
                        console.error('Failed to render image annotation:', imageError);
                      }
                    } else if (annotation.content || annotation.text) {
                      // Handle text annotations
                      page.drawText(annotation.content || annotation.text, {
                        x: pdfX,
                        y: pdfY + height - 12, // Adjust for text baseline
                        size: 12,
                        color: rgb(0, 0, 0)
                      });
                      totalRendered++;
                      console.log(`Rendered text annotation: "${annotation.content || annotation.text}"`);
                    } else if (annotation.type === 14 || annotation.type === 15) {
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

                      totalRendered++;
                      console.log(`Rendered ink annotation placeholder at (${pdfX}, ${pdfY}) size (${width}x${height})`);
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

                      totalRendered++;
                      console.log(`Rendered unknown annotation type ${annotation.type} as placeholder`);
                    }
                  }
                } catch (annotationError) {
                  console.warn('Failed to render annotation:', annotationError);
                }
              }
            }
          }

          console.log(`Successfully rendered ${totalRendered} annotations`);

          // Save the PDF with rendered annotations
          const flattenedPdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
          console.log(`Original PDF size: ${pdfArrayBufferForFlattening.byteLength} bytes`);
          console.log(`Modified PDF size: ${flattenedPdfBytes.length} bytes`);

          const arrayBuffer = new ArrayBuffer(flattenedPdfBytes.length);
          const uint8View = new Uint8Array(arrayBuffer);
          uint8View.set(flattenedPdfBytes);
          signedFile = new File([arrayBuffer], currentFile.name, { type: 'application/pdf' });
          console.log('Manual annotation rendering completed');

          // Verify the modified PDF can be loaded
          try {
            const verifyDoc = await PDFDocument.load(flattenedPdfBytes);
            console.log(`✓ Verification: Modified PDF has ${verifyDoc.getPages().length} pages and can be loaded`);
          } catch (verifyError) {
            console.error('❌ Verification: Modified PDF cannot be loaded:', verifyError);
          }
        } catch (renderError) {
          console.error('Failed to manually render annotations:', renderError);
          console.warn('Signatures may only show as annotations');
        }
      } else {
        console.log('No annotations found to render');
      }

      // Generate thumbnail and metadata for the signed file
      const thumbnailResult = await generateThumbnailWithMetadata(signedFile);
      const processedFileMetadata = createProcessedFile(thumbnailResult.pageCount, thumbnailResult.thumbnail);

      // Prepare input file data for replacement
      const inputFileIds: FileId[] = [currentFile.fileId];

      const record = selectors.getStirlingFileStub(currentFile.fileId);
      if (!record) {
        console.error('No file record found for:', currentFile.fileId);
        return false;
      }

      // Create output stub and file
      const outputStub = createNewStirlingFileStub(signedFile, undefined, thumbnailResult.thumbnail, processedFileMetadata);
      const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

      // Replace the original file with the signed version
      await consumeFiles(inputFileIds, [outputStirlingFile], [outputStub]);

      console.log('✓ Signature flattening completed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error flattening signatures:', error);
    return false;
  }
}