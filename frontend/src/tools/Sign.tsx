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

const Sign = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const { setWorkbench } = useNavigation();
  const { setSignatureConfig, activateDrawMode, activateSignaturePlacementMode, deactivateDrawMode, updateDrawSettings, undo, redo, isPlacementMode } = useSignature();
  const { actions } = useFileActions();
  const { consumeFiles, selectors } = useFileContext();
  const { exportActions } = useViewer();

  // Track which signature mode was active for reactivation after save
  const activeModeRef = useRef<'draw' | 'placement' | null>(null);

  // Manual sync function
  const syncSignatureConfig = () => {
    setSignatureConfig(base.params.parameters);
  };

  // Single handler that syncs first
  const handleSignaturePlacement = () => {
    syncSignatureConfig();
    setTimeout(() => {
      activateSignaturePlacementMode();
    }, 100);
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
      // Use EmbedPDF's saveAsCopy to apply signatures and get ArrayBuffer
      const pdfArrayBuffer = await exportActions.saveAsCopy();

      if (pdfArrayBuffer) {
        // Convert ArrayBuffer to File
        const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

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

        const signedFile = new File([blob], originalFile.name, { type: 'application/pdf' });

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

        // Reactivate the signature mode that was active before save
        setTimeout(() => {
          if (activeModeRef.current === 'draw') {
            activateDrawMode();
          } else if (activeModeRef.current === 'placement') {
            handleSignaturePlacement();
          }
        }, 200);
      }
    } catch (error) {
      console.error('Error saving signed document:', error);
    }
  }, [exportActions, base.selectedFiles, selectors, consumeFiles]);

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