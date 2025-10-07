import { PDFDocument, rgb } from 'pdf-lib';
import { generateThumbnailWithMetadata } from './thumbnailUtils';
import { createProcessedFile, createChildStub } from '../contexts/file/fileActions';
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
  getScrollState: () => { currentPage: number; totalPages: number };
}

export async function flattenSignatures(options: SignatureFlatteningOptions): Promise<FileId[] | null> {
  const { signatureApiRef, getImageData, exportActions, selectors, consumeFiles, originalFile, getScrollState } = options;

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

    console.log(`Total annotations found: ${allAnnotations.reduce((sum, page) => sum + page.annotations.length, 0)}`);

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

    // Step 3: Use EmbedPDF's saveAsCopy to get the base PDF (now without annotations)
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
          const fileStub = selectors.getStirlingFileStub(allFileIds[0]);
          const fileObject = selectors.getFile(allFileIds[0]);
          if (fileStub && fileObject) {
            currentFile = createStirlingFile(fileObject, allFileIds[0] as FileId);
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

          console.log('Starting to render annotations. Total pages with annotations:', allAnnotations.length);

          for (const pageData of allAnnotations) {
            const { pageIndex, annotations } = pageData;
            console.log(`Rendering ${annotations.length} annotations on page ${pageIndex}`);

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

                    console.log('Processing annotation:', {
                      pageIndex,
                      hasImageData: !!imageDataUrl,
                      imageDataType: typeof imageDataUrl,
                      startsWithDataImage: imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image'),
                      position: { pdfX, pdfY, width, height }
                    });

                    if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
                      try {
                        console.log('Rendering image annotation at:', { pdfX, pdfY, width, height });

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

                        console.log('✓ Successfully rendered image annotation');

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

      console.log('Parent file record:', record);
      console.log('Parent version:', record.versionNumber);

      // Create output stub and file as a child of the original (increments version)
      const outputStub = createChildStub(
        record,
        { toolId: 'sign', timestamp: Date.now() },
        signedFile,
        thumbnailResult.thumbnail,
        processedFileMetadata
      );
      const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

      console.log('Output stub version:', outputStub.versionNumber);
      console.log('Consuming files - replacing:', inputFileIds, 'with:', outputStub.id);

      // Replace the original file with the signed version
      const newFileIds = await consumeFiles(inputFileIds, [outputStirlingFile], [outputStub]);

      console.log('✓ Signature flattening completed successfully. New file IDs:', newFileIds);
      return newFileIds;
    }

    return null;
  } catch (error) {
    console.error('Error flattening signatures:', error);
    return null;
  }
}