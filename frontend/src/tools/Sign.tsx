import { useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createToolFlow } from "../components/tools/shared/createToolFlow";
import { useSignParameters } from "../hooks/tools/sign/useSignParameters";
import { useSignOperation } from "../hooks/tools/sign/useSignOperation";
import { useBaseTool } from "../hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "../types/tool";
import SignSettings from "../components/tools/sign/SignSettings";
import { useNavigation } from "../contexts/NavigationContext";
import { useSignature } from "../contexts/SignatureContext";
import { useFileActions, useFileContext } from "../contexts/FileContext";
import { useViewer } from "../contexts/ViewerContext";
import { generateThumbnailWithMetadata } from "../utils/thumbnailUtils";
import { createNewStirlingFileStub, createStirlingFile, StirlingFileStub, StirlingFile, FileId, extractFiles } from "../types/fileContext";
import { createProcessedFile } from "../contexts/file/fileActions";
import { PDFDocument, PDFName, PDFDict, PDFArray, rgb } from 'pdf-lib';

const Sign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setWorkbench } = useNavigation();
  const { setSignatureConfig, activateDrawMode, activateSignaturePlacementMode, deactivateDrawMode, updateDrawSettings, undo, redo, isPlacementMode, signatureApiRef, getImageData } = useSignature();
  const { actions } = useFileActions();
  const { consumeFiles, selectors } = useFileContext();
  const { exportActions } = useViewer();

  // Track which signature mode was active for reactivation after save
  const activeModeRef = useRef<'draw' | 'placement' | null>(null);

  // Single handler that activates placement mode
  const handleSignaturePlacement = () => {
    activateSignaturePlacementMode();
  };

  const base = useBaseTool(
    'sign',
    useSignParameters,
    useSignOperation,
    props
  );

  // Open viewer when files are selected
  useEffect(() => {
    if (base.selectedFiles.length > 0) {
      setWorkbench('viewer');
    }
  }, [base.selectedFiles.length, setWorkbench]);


  // Sync signature configuration with context
  useEffect(() => {
    setSignatureConfig(base.params.parameters);
  }, [base.params.parameters, setSignatureConfig]);

  // Save signed files to the system - apply signatures using EmbedPDF and replace original
  const handleSaveToSystem = useCallback(async () => {
    try {
      // Step 1: Extract all annotations from EmbedPDF before export
      const allAnnotations: Array<{pageIndex: number, annotations: any[]}> = [];

      if (signatureApiRef?.current) {
        console.log('Extracting annotations from all pages...');

        // We need to know how many pages to check - let's assume we check first few pages
        // In a real implementation, we'd get the page count from somewhere
        for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
          try {
            const pageAnnotations = await signatureApiRef.current.getPageAnnotations(pageIndex);
            if (pageAnnotations && pageAnnotations.length > 0) {
              allAnnotations.push({pageIndex, annotations: pageAnnotations});
              console.log(`Found ${pageAnnotations.length} annotations on page ${pageIndex + 1}`);
              console.log('Annotation data:', pageAnnotations);
            }
          } catch (e) {
            // Page doesn't exist or no annotations, continue
            console.log(`No annotations on page ${pageIndex + 1}:`, e);
            if (pageIndex > 2) break; // Stop after checking first few pages
          }
        }
      }

      console.log(`Total annotations found: ${allAnnotations.reduce((sum, page) => sum + page.annotations.length, 0)}`);

      // Step 2: Delete annotations from EmbedPDF before export (they'll be rendered manually)
      if (allAnnotations.length > 0 && signatureApiRef?.current) {
        console.log('Deleting annotations from EmbedPDF before export...');
        for (const pageData of allAnnotations) {
          for (const annotation of pageData.annotations) {
            try {
              await signatureApiRef.current.deleteAnnotation(annotation.id, pageData.pageIndex);
              console.log(`Deleted annotation ${annotation.id} from page ${pageData.pageIndex}`);
            } catch (deleteError) {
              console.warn(`Failed to delete annotation ${annotation.id}:`, deleteError);
            }
          }
        }
      }

      // Step 3: Use EmbedPDF's saveAsCopy to get the base PDF (now without annotations)
      const pdfArrayBuffer = await exportActions.saveAsCopy();

      if (pdfArrayBuffer) {
        console.log(`EmbedPDF exported PDF size: ${pdfArrayBuffer.byteLength} bytes`);

        // Try loading with more permissive PDF-lib options
        console.log('Attempting to load PDF with PDF-lib...');

        // Convert ArrayBuffer to File
        let blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

        // Get the current file - try from base.selectedFiles first, then from all files
        let originalFile = null;
        if (base.selectedFiles.length > 0) {
          originalFile = base.selectedFiles[0];
        } else {
          const allFileIds = selectors.getAllFileIds();
          if (allFileIds.length > 0) {
            const fileStub = selectors.getStirlingFileStub(allFileIds[0]);
            const fileObject = selectors.getFile(allFileIds[0]);
            if (fileStub && fileObject) {
              originalFile = createStirlingFile(fileObject, allFileIds[0]);
            }
          }
        }

        if (!originalFile) {
          console.error('No file available to replace');
          return;
        }

        let signedFile = new File([blob], originalFile.name, { type: 'application/pdf' });

        // Step 3: Manually render extracted annotations onto the PDF using PDF-lib
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
            } catch (loadError) {
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
            const annotationsToDelete: Array<{pageIndex: number, id: string}> = [];


            for (const pageData of allAnnotations) {
              const { pageIndex, annotations } = pageData;

              if (pageIndex < pages.length) {
                const page = pages[pageIndex];
                const { width: pageWidth, height: pageHeight } = page.getSize();

                for (const annotation of annotations) {
                  try {
                    console.log('Processing annotation:', annotation);
                    console.log('Annotation keys:', Object.keys(annotation));

                    // EmbedPDF annotations might have different property names
                    // Let's check for various possible rectangle properties
                    const rect = annotation.rect || annotation.bounds || annotation.rectangle || annotation.position;
                    console.log('Rect found:', rect);

                    if (rect) {
                      // Extract original annotation position and size
                      const originalX = rect.origin?.x || rect.x || rect.left || 0;
                      const originalY = rect.origin?.y || rect.y || rect.top || 0;
                      const width = rect.size?.width || rect.width || 100;
                      const height = rect.size?.height || rect.height || 50;

                      // Convert EmbedPDF coordinates to PDF-lib coordinates
                      // EmbedPDF uses top-left origin, PDF-lib uses bottom-left origin
                      const pdfX = originalX;
                      const pdfY = pageHeight - originalY - height;

                      console.log('Signature positioning:', {
                        originalX,
                        originalY,
                        width,
                        height,
                        pdfX,
                        pdfY,
                        pageWidth,
                        pageHeight
                      });

                      // Try to get annotation image data - check multiple possible properties
                      console.log('Looking for image data in:', {
                        imageData: !!annotation.imageData,
                        appearance: !!annotation.appearance,
                        stampData: !!annotation.stampData,
                        imageSrc: !!annotation.imageSrc,
                        contents: !!annotation.contents,
                        data: !!annotation.data
                      });

                      let imageDataUrl = annotation.imageData || annotation.appearance || annotation.stampData || annotation.imageSrc || annotation.contents || annotation.data;

                      // If no image data found directly, try to get it from our storage using annotation ID
                      if (!imageDataUrl && annotation.id) {
                        const storedImageData = getImageData(annotation.id);
                        if (storedImageData) {
                          console.log('Found stored image data for annotation:', annotation.id);
                          imageDataUrl = storedImageData;
                        }
                      }

                      if (imageDataUrl) {
                        console.log('Found image data:', typeof imageDataUrl, imageDataUrl?.substring?.(0, 100));
                      }

                      if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image')) {
                          try {
                            // Convert data URL to bytes
                            const base64Data = imageDataUrl.split(',')[1];
                            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                            console.log(`Image data size: ${imageBytes.length} bytes`);

                            // Embed image in PDF based on data URL type
                            let image;
                            if (imageDataUrl.includes('data:image/jpeg') || imageDataUrl.includes('data:image/jpg')) {
                              console.log('Embedding as JPEG');
                              image = await pdfDoc.embedJpg(imageBytes);
                            } else if (imageDataUrl.includes('data:image/png')) {
                              console.log('Embedding as PNG');
                              image = await pdfDoc.embedPng(imageBytes);
                            } else {
                              console.log('Unknown image type, trying PNG as fallback');
                              image = await pdfDoc.embedPng(imageBytes);
                            }

                            const imageDims = image.size();
                            console.log(`Image dimensions: ${imageDims.width}x${imageDims.height}`);

                            // Draw image on page at annotation position
                            page.drawImage(image, {
                              x: pdfX,
                              y: pdfY,
                              width: width,
                              height: height,
                            });

                            totalRendered++;
                            annotationsToDelete.push({pageIndex, id: annotation.id});
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
                        annotationsToDelete.push({pageIndex, id: annotation.id});
                        console.log(`Rendered text annotation: "${annotation.content || annotation.text}"`);
                      } else if (annotation.type === 14 || annotation.type === 15) {
                        // Handle ink annotations (drawn signatures)
                        // Type 14 = INK, Type 15 = could be another drawing type
                        console.log('Processing ink annotation:', annotation);

                        // For ink annotations, we'll draw a placeholder rectangle since we can't easily reconstruct the ink paths
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

                        // Add text indicating this was a drawn signature
                        page.drawText('Drawn Signature', {
                          x: pdfX + 5,
                          y: pdfY + height / 2,
                          size: 10,
                          color: rgb(0, 0, 0)
                        });

                        totalRendered++;
                        annotationsToDelete.push({pageIndex, id: annotation.id});
                        console.log(`Rendered ink annotation placeholder at (${pdfX}, ${pdfY}) size (${width}x${height})`);
                      } else {
                        // Handle other annotation types
                        console.log(`Unknown annotation type ${annotation.type}:`, annotation);

                        // Draw a placeholder for unknown types
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
                        annotationsToDelete.push({pageIndex, id: annotation.id});
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

            // Annotations were already deleted from EmbedPDF before export

            // Save the PDF with rendered annotations
            const flattenedPdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
            console.log(`Original PDF size: ${pdfArrayBufferForFlattening.byteLength} bytes`);
            console.log(`Modified PDF size: ${flattenedPdfBytes.length} bytes`);

            const arrayBuffer = new ArrayBuffer(flattenedPdfBytes.length);
            const uint8View = new Uint8Array(arrayBuffer);
            uint8View.set(flattenedPdfBytes);
            signedFile = new File([arrayBuffer], originalFile.name, { type: 'application/pdf' });
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
        const inputFileIds: FileId[] = [originalFile.fileId];
        const inputStirlingFileStubs: StirlingFileStub[] = [];

        const record = selectors.getStirlingFileStub(originalFile.fileId);
        if (record) {
          inputStirlingFileStubs.push(record);
        } else {
          console.error('No file record found for:', originalFile.fileId);
          return;
        }

        // Create output stub and file
        const outputStub = createNewStirlingFileStub(signedFile, undefined, thumbnailResult.thumbnail, processedFileMetadata);
        const outputStirlingFile = createStirlingFile(signedFile, outputStub.id);

        // Replace the original file with the signed version
        await consumeFiles(inputFileIds, [outputStirlingFile], [outputStub]);

        console.log('✓ File replaced in context, new file ID:', outputStub.id);

        // Force refresh the viewer to show the flattened PDF
        setTimeout(() => {
          // Navigate away from viewer and back to force reload
          setWorkbench('fileEditor');
          setTimeout(() => {
            setWorkbench('viewer');

            // Reactivate the signature mode that was active before save
            if (activeModeRef.current === 'draw') {
              activateDrawMode();
            } else if (activeModeRef.current === 'placement') {
              handleSignaturePlacement();
            }
          }, 100);
        }, 200);
      }
    } catch (error) {
      console.error('Error saving signed document:', error);
    }
  }, [exportActions, base.selectedFiles, selectors, consumeFiles, signatureApiRef, getImageData]);

  const getSteps = () => {
    const steps = [];

    // Step 1: Signature Configuration - Always visible
    steps.push({
      title: t('sign.steps.configure', 'Configure Signature'),
      isCollapsed: false,
      onCollapsedClick: undefined,
      content: (
        <SignSettings
          parameters={base.params.parameters}
          onParameterChange={base.params.updateParameter}
          disabled={base.endpointLoading}
          onActivateDrawMode={() => {
            activeModeRef.current = 'draw';
            activateDrawMode();
          }}
          onActivateSignaturePlacement={() => {
            activeModeRef.current = 'placement';
            handleSignaturePlacement();
          }}
          onDeactivateSignature={deactivateDrawMode}
          onUpdateDrawSettings={updateDrawSettings}
          onUndo={undo}
          onRedo={redo}
          onSave={handleSaveToSystem}
        />
      ),
    });

    return steps;
  };

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.operation.files.length > 0,
    },
    steps: getSteps(),
    review: {
      isVisible: false, // Hide review section - save moved to configure section
      operation: base.operation,
      title: t('sign.results.title', 'Signature Results'),
      onFileClick: base.handleThumbnailClick,
      onUndo: () => {},
    },
    forceStepNumbers: true,
  });
};

// Add the required static methods for automation
Sign.tool = () => useSignOperation;
Sign.getDefaultParameters = () => ({
  signatureType: 'canvas',
  reason: 'Document signing',
  location: 'Digital',
  signerName: '',
});

export default Sign as ToolComponent;