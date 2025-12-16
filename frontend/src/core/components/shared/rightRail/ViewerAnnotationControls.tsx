import React, { useState, useEffect, useCallback } from 'react';
import { ActionIcon, Popover } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { ColorSwatchButton, ColorPicker } from '@app/components/annotation/shared/ColorPicker';
import { useFileState, useFileContext } from '@app/contexts/FileContext';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
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
  const [pendingAnnotationAfterRedaction, setPendingAnnotationAfterRedaction] = useState(false);

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
  const { pendingCount: redactionPendingCount, isRedacting: _isRedacting, activeType } = useRedactionMode();
  const { requestNavigation, setHasUnsavedChanges } = useNavigationGuard();
  const { setRedactionMode, activateTextSelection, setRedactionConfig, setRedactionsApplied, redactionApiRef, setActiveType } = useRedaction();

  const activateDrawingTools = useCallback(() => {
    if (!signatureApiRef?.current) return;
    try {
      signatureApiRef.current.activateDrawMode();
      signatureApiRef.current.updateDrawSettings(selectedColor, 2);
    } catch (error) {
      console.log('Signature API not ready:', error);
    }
  }, [selectedColor, signatureApiRef]);

  // Turn off annotation mode when switching away from viewer
  useEffect(() => {
    if (currentView !== 'viewer' && viewerContext?.isAnnotationMode) {
      viewerContext.setAnnotationMode(false);
    }
  }, [currentView, viewerContext]);

  // Activate draw mode when annotation mode becomes active
  useEffect(() => {
    if (viewerContext?.isAnnotationMode && currentView === 'viewer') {
      activateDrawingTools();
    }
  }, [viewerContext?.isAnnotationMode, currentView, activateDrawingTools]);

  // Don't show any annotation controls in sign mode
  if (isSignMode) {
    return null;
  }

  // Persist annotations to file if there are unsaved changes
  const saveAnnotationsIfNeeded = async () => {
    if (!viewerContext?.exportActions?.saveAsCopy || currentView !== 'viewer' || !historyApiRef?.current?.canUndo()) return;
    if (activeFiles.length === 0 || state.files.ids.length === 0) return;

    try {
      const arrayBuffer = await viewerContext.exportActions.saveAsCopy();
      if (!arrayBuffer) return;

      const file = new File([new Blob([arrayBuffer])], activeFiles[0].name, { type: 'application/pdf' });
      const parentStub = selectors.getStirlingFileStub(state.files.ids[0]);
      if (!parentStub) return;

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'redact');
      await fileActions.consumeFiles([state.files.ids[0]], stirlingFiles, stubs);
      
      // Clear unsaved changes flags after successful save
      setHasUnsavedChanges(false);
      setRedactionsApplied(false);
    } catch (error) {
      console.error('Error auto-saving annotations before redaction:', error);
    }
  };

  const exitRedactionMode = useCallback(() => {
    navActions.setToolAndWorkbench(null, 'viewer');
    setLeftPanelView('toolPicker');
    setRedactionMode(false);
    setActiveType(null);
  }, [navActions, setLeftPanelView, setRedactionMode, setActiveType]);

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
        exitRedactionMode();
      }
    } else {
      await saveAnnotationsIfNeeded();

      if (viewerContext?.isAnnotationMode) {
        viewerContext.setAnnotationMode(false);
        if (signatureApiRef?.current) {
          try {
            signatureApiRef.current.deactivateTools();
          } catch (error) {
            console.log('Unable to deactivate annotation tools:', error);
          }
        }
      }

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
        const currentType = redactionApiRef.current?.getActiveType?.();
        if (currentType !== 'redactSelection') {
          activateTextSelection();
        }
      }, 200);
    }
  };

  const startAnnotationMode = useCallback(() => {
    viewerContext?.setAnnotationMode(true);
    activateDrawingTools();
  }, [viewerContext, activateDrawingTools]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!isRedactMode && pendingAnnotationAfterRedaction) {
      timer = setTimeout(() => {
        setPendingAnnotationAfterRedaction(false);
        startAnnotationMode();
      }, 200);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isRedactMode, pendingAnnotationAfterRedaction, startAnnotationMode]);

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
                  viewerContext?.setAnnotationMode(false);
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
              const scheduleAnnotationAfterRedaction = () => {
                setPendingAnnotationAfterRedaction(true);
                exitRedactionMode();
              };

              const beginAnnotation = () => {
                if (isRedactMode) {
                  scheduleAnnotationAfterRedaction();
                } else {
                  startAnnotationMode();
                }
              };

              // If in redaction mode with pending redactions, show warning modal
              if (isRedactMode && redactionPendingCount > 0) {
                requestNavigation(beginAnnotation);
              } else {
                beginAnnotation();
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

                  // Replace the current file in context with the saved version
                  if (activeFiles.length > 0 && state.files.ids.length > 0) {
                    const parentStub = selectors.getStirlingFileStub(state.files.ids[0]);
                    if (!parentStub) {
                      console.error('No file record found for:', state.files.ids[0]);
                      return;
                    }

                    const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([newFile], parentStub, 'multiTool');
                    await fileActions.consumeFiles([state.files.ids[0]], stirlingFiles, stubs);
                    
                    // Clear unsaved changes flags after successful save
                    setHasUnsavedChanges(false);
                    setRedactionsApplied(false);
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
