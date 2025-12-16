import React, { useState, useEffect } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { ColorSwatchButton, ColorPicker } from '@app/components/annotation/shared/ColorPicker';
import { useFileState, useFileContext } from '@app/contexts/FileContext';
import { generateThumbnailWithMetadata } from '@app/utils/thumbnailUtils';
import { createProcessedFile } from '@app/contexts/file/fileActions';
import { createStirlingFile, createNewStirlingFileStub } from '@app/types/fileContext';
import { useNavigationState, useNavigationGuard, useNavigationActions } from '@app/contexts/NavigationContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useRightRailTooltipSide } from '@app/hooks/useRightRailTooltipSide';
import { useRedactionMode, useRedaction } from '@app/contexts/RedactionContext';
import { defaultParameters, RedactParameters } from '@app/hooks/tools/redact/useRedactParameters';

interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
}

export default function ViewerAnnotationControls({ currentView, disabled = false }: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const { setLeftPanelView, setSidebarsVisible } = useToolWorkflow();
  const { position: tooltipPosition, offset: tooltipOffset } = useRightRailTooltipSide(sidebarRefs);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isHoverColorPickerOpen, setIsHoverColorPickerOpen] = useState(false);

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Signature context for accessing drawing API
  const { signatureApiRef, historyApiRef, isPlacementMode } = useSignature();

  // File state for save functionality
  const { state, selectors } = useFileState();
  const { actions: fileActions } = useFileContext();
  const activeFiles = selectors.getFiles();

  // Check if we're in sign mode or redaction mode
  const { selectedTool, workbench } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const isSignMode = selectedTool === 'sign';
  const isRedactMode = selectedTool === 'redact';
  
  // Get redaction pending state and navigation guard
  const { pendingCount: redactionPendingCount, isRedacting: _isRedacting } = useRedactionMode();
  const { requestNavigation } = useNavigationGuard();
  const { setRedactionMode, activateTextSelection, setRedactionConfig } = useRedaction();

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

  // Persist annotations to file if there are unsaved changes
  const saveAnnotationsIfNeeded = async () => {
    if (!viewerContext?.exportActions?.saveAsCopy || currentView !== 'viewer') return;
    const hasUnsavedAnnotations = historyApiRef?.current?.canUndo() || false;
    if (!hasUnsavedAnnotations) return;

    try {
      const pdfArrayBuffer = await viewerContext.exportActions.saveAsCopy();
      if (!pdfArrayBuffer) return;

      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      const originalFileName = activeFiles.length > 0 ? activeFiles[0].name : 'document.pdf';
      const newFile = new File([blob], originalFileName, { type: 'application/pdf' });

      if (activeFiles.length > 0) {
        const thumbnailResult = await generateThumbnailWithMetadata(newFile);
        const processedFileMetadata = createProcessedFile(thumbnailResult.pageCount, thumbnailResult.thumbnail);

        const currentFileIds = state.files.ids;
        if (currentFileIds.length > 0) {
          const currentFileId = currentFileIds[0];
          const currentRecord = selectors.getStirlingFileStub(currentFileId);
          if (!currentRecord) {
            console.error('No file record found for:', currentFileId);
            return;
          }

          const outputStub = createNewStirlingFileStub(newFile, undefined, thumbnailResult.thumbnail, processedFileMetadata);
          const outputStirlingFile = createStirlingFile(newFile, outputStub.id);

          await fileActions.consumeFiles([currentFileId], [outputStirlingFile], [outputStub]);
        }
      }
    } catch (error) {
      console.error('Error auto-saving annotations before redaction:', error);
    }
  };

  // Handle redaction mode toggle
  const handleRedactionToggle = async () => {
    if (isRedactMode) {
      // If already in redact mode, toggle annotation mode off and show redaction layer
      if (viewerContext?.isAnnotationMode) {
        await saveAnnotationsIfNeeded();

        viewerContext.setAnnotationMode(false);
        // Deactivate any active annotation tools
        if (signatureApiRef?.current) {
          try {
            signatureApiRef.current.deactivateTools();
          } catch (error) {
            console.log('Unable to deactivate annotation tools:', error);
          }
        }
        // Activate redaction tool
        setTimeout(() => {
          activateTextSelection();
        }, 100);
      } else {
        // Exit redaction mode - keep viewer workbench and show all tools in sidebar
        navActions.setToolAndWorkbench(null, 'viewer');
        setLeftPanelView('toolPicker');
        setRedactionMode(false);
      }
    } else {
      await saveAnnotationsIfNeeded();

      // Enter redaction mode - select redact tool with manual mode
      // If we're already in the viewer, keep the viewer workbench and open the tool sidebar
      if (workbench === 'viewer') {
        // Set redaction config to manual mode when opening from viewer
        const manualConfig: RedactParameters = {
          ...defaultParameters,
          mode: 'manual',
        };
        setRedactionConfig(manualConfig);
        
        // Set tool and keep viewer workbench
        navActions.setToolAndWorkbench('redact', 'viewer');
        
        // Ensure sidebars are visible and open tool content
        setSidebarsVisible(true);
        setLeftPanelView('toolContent');
      } else {
        navActions.handleToolSelect('redact');
      }
      setRedactionMode(true);
      // Activate text selection mode after a short delay
      setTimeout(() => {
        activateTextSelection();
      }, 200);
    }
  };

  return (
    <>
      {/* Redaction Mode Toggle */}
      <Tooltip content={isRedactMode && !viewerContext?.isAnnotationMode ? t('rightRail.exitRedaction', 'Exit Redaction Mode') : t('rightRail.redact', 'Redact')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant={isRedactMode && !viewerContext?.isAnnotationMode ? 'filled' : 'subtle'}
          color={isRedactMode && !viewerContext?.isAnnotationMode ? 'red' : undefined}
          radius="md"
          className="right-rail-icon"
          onClick={handleRedactionToggle}
          disabled={disabled || currentView !== 'viewer'}
        >
          <LocalIcon
            icon="scan-delete-rounded"
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>

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
            icon={viewerContext?.isAnnotationsVisible ? "visibility" : "preview-off-rounded"}
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>

      {/* Annotation Mode Toggle with Drawing Controls */}
      {viewerContext?.isAnnotationMode ? (
        // When active: Show color picker on hover
        <div
          onMouseEnter={() => setIsHoverColorPickerOpen(true)}
          onMouseLeave={() => setIsHoverColorPickerOpen(false)}
          style={{ display: 'inline-flex' }}
        >
          <Popover
            opened={isHoverColorPickerOpen}
            onClose={() => setIsHoverColorPickerOpen(false)}
            position="left"
            withArrow
            shadow="md"
            offset={8}
          >
            <Popover.Target>
              <ActionIcon
                variant="filled"
                color="blue"
                radius="md"
                className="right-rail-icon"
                onClick={() => {
                  viewerContext?.toggleAnnotationMode();
                  setIsHoverColorPickerOpen(false); // Close hover color picker when toggling off
                  // Deactivate drawing tool when exiting annotation mode
                  if (signatureApiRef?.current) {
                    try {
                      signatureApiRef.current.deactivateTools();
                    } catch (error) {
                      console.log('Signature API not ready:', error);
                    }
                  }
                }}
              disabled={disabled}
                aria-label="Drawing mode active"
              >
                <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <div style={{ minWidth: '8rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>Drawing Color</div>
                  <ColorSwatchButton
                    color={selectedColor}
                    size={32}
                    onClick={() => {
                      setIsHoverColorPickerOpen(false); // Close hover picker
                      setIsColorPickerOpen(true); // Open main color picker modal
                    }}
                  />
                </div>
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>
      ) : (
        // When inactive: Show "Draw" tooltip
        <Tooltip content={t('rightRail.draw', 'Draw')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
          <ActionIcon
            variant="subtle"
            radius="md"
            className="right-rail-icon"
            onClick={() => {
              const activateDrawMode = () => {
                // Use setTimeout to ensure this runs after any state updates from applyChanges
                setTimeout(() => {
                  viewerContext?.setAnnotationMode(true);
                  // Activate ink drawing tool when entering annotation mode
                  if (signatureApiRef?.current && currentView === 'viewer') {
                    try {
                      signatureApiRef.current.activateDrawMode();
                      signatureApiRef.current.updateDrawSettings(selectedColor, 2);
                    } catch (error) {
                      console.log('Signature API not ready:', error);
                    }
                  }
                }, 150);
              };
              
              // If in redaction mode with pending redactions, show warning modal
              if (isRedactMode && redactionPendingCount > 0) {
                requestNavigation(activateDrawMode);
              } else {
                // Direct activation - no need for delay
                viewerContext?.toggleAnnotationMode();
                if (signatureApiRef?.current && currentView === 'viewer') {
                  try {
                    signatureApiRef.current.activateDrawMode();
                    signatureApiRef.current.updateDrawSettings(selectedColor, 2);
                  } catch (error) {
                    console.log('Signature API not ready:', error);
                  }
                }
              }
            }}
            disabled={disabled}
            aria-label={typeof t === 'function' ? t('rightRail.draw', 'Draw') : 'Draw'}
          >
            <LocalIcon icon="edit" width="1.5rem" height="1.5rem" />
          </ActionIcon>
        </Tooltip>
      )}

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

      {/* Color Picker Modal */}
      <ColorPicker
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        selectedColor={selectedColor}
        onColorChange={(color) => {
          setSelectedColor(color);
          // Update drawing tool color if annotation mode is active
          if (viewerContext?.isAnnotationMode && signatureApiRef?.current && currentView === 'viewer') {
            try {
              signatureApiRef.current.updateDrawSettings(color, 2);
            } catch (error) {
              console.log('Unable to update drawing settings:', error);
            }
          }
        }}
        title="Choose Drawing Color"
      />
    </>
  );
}
