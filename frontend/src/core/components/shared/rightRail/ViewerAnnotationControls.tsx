import React, { useEffect } from 'react';
import { ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { useFileState, useFileContext } from '@app/contexts/FileContext';
import { generateThumbnailWithMetadata } from '@app/utils/thumbnailUtils';
import { createProcessedFile } from '@app/contexts/file/fileActions';
import { createStirlingFile, createNewStirlingFileStub } from '@app/types/fileContext';
import { useNavigation, useNavigationState } from '@app/contexts/NavigationContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useRightRailTooltipSide } from '@app/hooks/useRightRailTooltipSide';

interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
}

export default function ViewerAnnotationControls({ currentView, disabled = false }: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition, offset: tooltipOffset } = useRightRailTooltipSide(sidebarRefs);
  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Signature context for accessing drawing API
  const { signatureApiRef, isPlacementMode } = useSignature();

  const { setToolAndWorkbench } = useNavigation();

  // File state for save functionality
  const { state, selectors } = useFileState();
  const { actions: fileActions } = useFileContext();
  const activeFiles = selectors.getFiles();

  // Check if we're in sign mode
  const { selectedTool } = useNavigationState();
  const isSignMode = selectedTool === 'sign';
  const isAnnotateMode = selectedTool === 'annotate';

  // When leaving viewer, turn off annotation overlay
  useEffect(() => {
    if (currentView !== 'viewer' && viewerContext?.isAnnotationMode) {
      viewerContext.setAnnotationMode(false);
    }
  }, [currentView, viewerContext]);

  // Turn off annotation mode when switching away from viewer
  useEffect(() => {
    if (currentView !== 'viewer' && viewerContext?.isAnnotationMode) {
      viewerContext.setAnnotationMode(false);
    }
  }, [currentView, viewerContext]);

  // Don't show any annotation controls in sign mode
  if (isSignMode) {
    return null;
  }

  return (
    <>
      {/* Annotation Visibility Toggle */}
      <Tooltip content={t('rightRail.toggleAnnotations', 'Toggle Annotations Visibility')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant="subtle"
          radius="md"
          className="right-rail-icon"
          onClick={() => {
            viewerContext?.toggleAnnotationsVisibility();
          }}
          disabled={disabled || currentView !== 'viewer' || viewerContext?.isAnnotationMode || isPlacementMode}
        >
          <LocalIcon
            icon={viewerContext?.isAnnotationsVisible ? "visibility" : "visibility-off-rounded"}
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>

      {/* Launch Annotate tool in the left panel */}
      <Tooltip content={t('rightRail.draw', 'Draw')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant="subtle"
          radius="md"
          className="right-rail-icon"
          onClick={() => setToolAndWorkbench('annotate', 'viewer')}
          disabled={disabled}
          aria-label={typeof t === 'function' ? t('rightRail.draw', 'Draw') : 'Draw'}
        >
          <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />
        </ActionIcon>
      </Tooltip>

      {/* Save PDF with Annotations */}
      <Tooltip content={t('rightRail.save', 'Save')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant="subtle"
          radius="md"
          className="right-rail-icon"
          onClick={async () => {
            if (viewerContext?.exportActions?.saveAsCopy && currentView === 'viewer') {
              try {
                const pdfArrayBuffer = await viewerContext.exportActions.saveAsCopy();
                if (pdfArrayBuffer) {
                  // Create new File object with flattened annotations
                  const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

                  // Get the original file name or use a default
                  const originalFileName = activeFiles.length > 0 ? activeFiles[0].name : 'document.pdf';
                  const newFile = new File([blob], originalFileName, { type: 'application/pdf' });

                  // Replace the current file in context with the saved version (exact same logic as Sign tool)
                  if (activeFiles.length > 0) {
                    // Generate thumbnail and metadata for the saved file
                    const thumbnailResult = await generateThumbnailWithMetadata(newFile);
                    const processedFileMetadata = createProcessedFile(thumbnailResult.pageCount, thumbnailResult.thumbnail);

                    // Get current file info
                    const currentFileIds = state.files.ids;
                    if (currentFileIds.length > 0) {
                      const currentFileId = currentFileIds[0];
                      const currentRecord = selectors.getStirlingFileStub(currentFileId);

                      if (!currentRecord) {
                        console.error('No file record found for:', currentFileId);
                        return;
                      }

                      // Create output stub and file (exact same as Sign tool)
                      const outputStub = createNewStirlingFileStub(newFile, undefined, thumbnailResult.thumbnail, processedFileMetadata);
                      const outputStirlingFile = createStirlingFile(newFile, outputStub.id);

                      // Replace the original file with the saved version
                      await fileActions.consumeFiles([currentFileId], [outputStirlingFile], [outputStub]);
                    }
                  }
                }
              } catch (error) {
                console.error('Error saving PDF:', error);
              }
            }
          }}
          disabled={disabled}
        >
          <LocalIcon icon="save" width="1.5rem" height="1.5rem" />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
