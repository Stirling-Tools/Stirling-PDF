import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Center, Text, ActionIcon, Tabs, Collapse, Group, Button, Tooltip } from '@mantine/core';
import { useMantineTheme, useMantineColorScheme } from '@mantine/core';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useTranslation } from 'react-i18next';

import { useFileState, useFileActions } from "../../contexts/FileContext";
import { useFileWithUrl } from "../../hooks/useFileWithUrl";
import { useViewer } from "../../contexts/ViewerContext";
import { LocalEmbedPDF } from './LocalEmbedPDF';
import { PdfViewerToolbar } from './PdfViewerToolbar';
import { ThumbnailSidebar } from './ThumbnailSidebar';
import { useNavigationGuard, useNavigationState } from '../../contexts/NavigationContext';
import { useSignature } from '../../contexts/SignatureContext';
import { createStirlingFilesAndStubs } from '../../services/fileStubHelpers';
import NavigationWarningModal from '../shared/NavigationWarningModal';
import { isStirlingFile } from '../../types/fileContext';

export interface EmbedPdfViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
}

const EmbedPdfViewerContent = ({
  sidebarsVisible: _sidebarsVisible,
  setSidebarsVisible: _setSidebarsVisible,
  onClose,
  previewFile,
}: EmbedPdfViewerProps) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const [isViewerHovered, setIsViewerHovered] = React.useState(false);

  const { isThumbnailSidebarVisible, toggleThumbnailSidebar, zoomActions, spreadActions, panActions: _panActions, rotationActions: _rotationActions, getScrollState, getZoomState, getSpreadState, getRotationState, isAnnotationMode, isAnnotationsVisible, exportActions } = useViewer();

  const scrollState = getScrollState();
  const zoomState = getZoomState();
  const spreadState = getSpreadState();
  const rotationState = getRotationState();

  // Track initial rotation to detect changes
  const initialRotationRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialRotationRef.current === null && rotationState.rotation !== undefined) {
      initialRotationRef.current = rotationState.rotation;
    }
  }, [rotationState.rotation]);

  // Get signature context
  const { signatureApiRef, historyApiRef } = useSignature();

  // Get current file from FileContext
  const { selectors, state } = useFileState();
  const { actions } = useFileActions();
  const activeFiles = selectors.getFiles();
  const activeFileIds = activeFiles.map(f => f.fileId);
  const selectedFileIds = state.ui.selectedFileIds;

  // Navigation guard for unsaved changes
  const { setHasUnsavedChanges, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker } = useNavigationGuard();

  // Check if we're in signature mode OR viewer annotation mode
  const { selectedTool } = useNavigationState();
  const isSignatureMode = selectedTool === 'sign';

  // Enable annotations when: in sign mode, OR annotation mode is active, OR we want to show existing annotations
  const shouldEnableAnnotations = isSignatureMode || isAnnotationMode || isAnnotationsVisible;

  // Track which file tab is active
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [tabsExpanded, setTabsExpanded] = useState(true);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const hasInitializedFromSelection = useRef(false);

  // When viewer opens with a selected file, switch to that file
  useEffect(() => {
    if (!hasInitializedFromSelection.current && selectedFileIds.length > 0 && activeFiles.length > 0) {
      const selectedFileId = selectedFileIds[0];
      const index = activeFiles.findIndex(f => f.fileId === selectedFileId);
      if (index !== -1 && index !== activeFileIndex) {
        setActiveFileIndex(index);
      }
      hasInitializedFromSelection.current = true;
    }
  }, [selectedFileIds, activeFiles, activeFileIndex]);

  // Reset active tab if it's out of bounds
  useEffect(() => {
    if (activeFileIndex >= activeFiles.length && activeFiles.length > 0) {
      setActiveFileIndex(0);
    }
  }, [activeFiles.length, activeFileIndex]);

  // Minimize when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tabsContainerRef.current && !tabsContainerRef.current.contains(event.target as Node)) {
        setTabsExpanded(false);
      }
    };

    if (tabsExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [tabsExpanded]);

  // Determine which file to display
  const currentFile = React.useMemo(() => {
    if (previewFile) {
      return previewFile;
    } else if (activeFiles.length > 0) {
      return activeFiles[activeFileIndex] || activeFiles[0];
    }
    return null;
  }, [previewFile, activeFiles, activeFileIndex]);

  // Get file with URL for rendering
  const fileWithUrl = useFileWithUrl(currentFile);

  // Determine the effective file to display
  const effectiveFile = React.useMemo(() => {
    if (previewFile) {
      // In preview mode, show the preview file
      if (previewFile.size === 0) {
        return null;
      }
      return { file: previewFile, url: null };
    } else {
      return fileWithUrl;
    }
  }, [previewFile, fileWithUrl]);

  // Handle scroll wheel zoom with accumulator for smooth trackpad pinch
  React.useEffect(() => {
    let accumulator = 0;

    const handleWheel = (event: WheelEvent) => {
      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();

        accumulator += event.deltaY;
        const threshold = 10;

        if (accumulator <= -threshold) {
          // Accumulated scroll up - zoom in
          zoomActions.zoomIn();
          accumulator = 0;
        } else if (accumulator >= threshold) {
          // Accumulated scroll down - zoom out
          zoomActions.zoomOut();
          accumulator = 0;
        }
      }
    };

    const viewerElement = viewerRef.current;
    if (viewerElement) {
      viewerElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        viewerElement.removeEventListener('wheel', handleWheel);
      };
    }
  }, [zoomActions]);

  // Handle keyboard zoom shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isViewerHovered) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        if (event.key === '=' || event.key === '+') {
          // Ctrl+= or Ctrl++ for zoom in
          event.preventDefault();
          zoomActions.zoomIn();
        } else if (event.key === '-' || event.key === '_') {
          // Ctrl+- for zoom out
          event.preventDefault();
          zoomActions.zoomOut();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isViewerHovered]);

  // Register checker for unsaved changes (annotations only for now)
  useEffect(() => {
    if (previewFile) {
      return;
    }

    const checkForChanges = () => {
      // Check for annotation changes via history
      const hasAnnotationChanges = historyApiRef.current?.canUndo() || false;

      console.log('[Viewer] Checking for unsaved changes:', {
        hasAnnotationChanges
      });
      return hasAnnotationChanges;
    };

    console.log('[Viewer] Registering unsaved changes checker');
    registerUnsavedChangesChecker(checkForChanges);

    return () => {
      console.log('[Viewer] Unregistering unsaved changes checker');
      unregisterUnsavedChangesChecker();
    };
  }, [historyApiRef, previewFile, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

  // Apply changes - save annotations to new file version
  const applyChanges = useCallback(async () => {
    if (!currentFile || activeFileIds.length === 0) return;

    try {
      console.log('[Viewer] Applying changes - exporting PDF with annotations');

      // Step 1: Export PDF with annotations using EmbedPDF
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error('Failed to export PDF');
      }

      console.log('[Viewer] Exported PDF size:', arrayBuffer.byteLength);

      // Step 2: Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const filename = currentFile.name || 'document.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Step 3: Create StirlingFiles and stubs for version history
      const parentStub = selectors.getStirlingFileStub(activeFileIds[0]);
      if (!parentStub) throw new Error('Parent stub not found');

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'multiTool');

      // Step 4: Consume files (replace in context)
      await actions.consumeFiles(activeFileIds, stirlingFiles, stubs);

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Apply changes failed:', error);
    }
  }, [currentFile, activeFileIds, exportActions, actions, selectors, setHasUnsavedChanges]);

  return (
    <Box
      ref={viewerRef}
      onMouseEnter={() => setIsViewerHovered(true)}
      onMouseLeave={() => setIsViewerHovered(false)}
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        contain: 'layout style paint'
      }}>
      {/* Close Button - Only show in preview mode */}
      {onClose && previewFile && (
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000, borderRadius: '50%' }}
          onClick={onClose}
        >
          <CloseIcon />
        </ActionIcon>
      )}

      {!effectiveFile ? (
        <Center style={{ flex: 1 }}>
          <Text c="red">Error: No file provided to viewer</Text>
        </Center>
      ) : (
        <>
          {/* Floating tabs for multiple files */}
          {activeFiles.length > 1 && !previewFile && (
            <Box
              ref={tabsContainerRef}
              style={{
                position: 'absolute',
                top: '2rem',
                left: 0,
                zIndex: 100,
                maxWidth: tabsExpanded ? '400px' : 'auto',
                transition: 'max-width 0.3s ease',
                backgroundColor: 'var(--right-rail-bg)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderRadius: '0 0 8px 0',
                boxShadow: theme.shadows.md
              }}
            >
              <Box
                p="xs"
                style={{
                  cursor: 'pointer',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setTabsExpanded(!tabsExpanded)}
              >
                <Group gap="xs" style={{ width: '100%' }}>
                  {tabsExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  <Text size="sm" fw={500}>
                    {t('viewer.files', 'Files')} ({activeFiles.length})
                  </Text>
                </Group>
              </Box>

              <Collapse in={tabsExpanded}>
                <Box style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'hidden', padding: '0 0.5rem 0.5rem 0.5rem' }}>
                  <Tabs
                    value={activeFileIndex.toString()}
                    onChange={(value) => setActiveFileIndex(parseInt(value || '0'))}
                    variant="pills"
                    orientation="vertical"
                    styles={(theme) => ({
                      tab: {
                        justifyContent: 'flex-start',
                        '&[data-active]': {
                          backgroundColor: 'rgba(147, 197, 253, 0.8)',
                        },
                      },
                    })}
                  >
                    <Tabs.List>
                      {activeFiles.map((file, index) => {
                        const stub = selectors.getStirlingFileStub(file.fileId);
                        const displayName = file.name.length > 25 ? `${file.name.substring(0, 25)}...` : file.name;

                        return (
                          <Tooltip
                            key={file.fileId}
                            label={file.name}
                            openDelay={1000}
                            withArrow
                            position="right"
                          >
                            <Tabs.Tab
                              value={index.toString()}
                              style={{
                                backgroundColor: activeFileIndex === index ? 'color-mix(in srgb, var(--color-primary-500) 50%, transparent)' : undefined
                              }}
                            >
                              <Group gap="xs" style={{ width: '100%', justifyContent: 'flex-start' }}>
                                <Text size="sm" style={{ flex: 1, textAlign: 'left' }}>
                                  {displayName}
                                </Text>
                                {stub?.versionNumber && stub.versionNumber > 1 && (
                                  <Text size="xs" c="dimmed">
                                    v{stub.versionNumber}
                                  </Text>
                                )}
                              </Group>
                            </Tabs.Tab>
                          </Tooltip>
                        );
                      })}
                    </Tabs.List>
                  </Tabs>
                </Box>
              </Collapse>
            </Box>
          )}

          {/* EmbedPDF Viewer */}
          <Box style={{
            position: 'relative',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
            marginRight: isThumbnailSidebarVisible ? '15rem' : '0',
            transition: 'margin-right 0.3s ease'
          }}>
            <LocalEmbedPDF
              key={currentFile && isStirlingFile(currentFile) ? currentFile.fileId : (effectiveFile.file instanceof File ? effectiveFile.file.name : effectiveFile.url)}
              file={effectiveFile.file}
              url={effectiveFile.url}
              enableAnnotations={shouldEnableAnnotations}
              signatureApiRef={signatureApiRef as React.RefObject<any>}
              historyApiRef={historyApiRef as React.RefObject<any>}
              onSignatureAdded={() => {
                // Handle signature added - for debugging, enable console logs as needed
                // Future: Handle signature completion
              }}
            />
          </Box>
        </>
      )}

      {/* Bottom Toolbar Overlay */}
      {effectiveFile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            background: "transparent",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <PdfViewerToolbar
              currentPage={scrollState.currentPage}
              totalPages={scrollState.totalPages}
              onPageChange={(page) => {
                // Page navigation handled by scrollActions
                console.log('Navigate to page:', page);
              }}
              dualPage={spreadState.isDualPage}
              onDualPageToggle={() => {
                spreadActions.toggleSpreadMode();
              }}
              currentZoom={zoomState.zoomPercent}
            />
          </div>
        </div>
      )}


      {/* Thumbnail Sidebar */}
      <ThumbnailSidebar
        visible={isThumbnailSidebarVisible}
        onToggle={toggleThumbnailSidebar}
      />

      {/* Navigation Warning Modal */}
      {!previewFile && (
        <NavigationWarningModal
          onApplyAndContinue={async () => {
            await applyChanges();
          }}
        />
      )}
    </Box>
  );
};

const EmbedPdfViewer = (props: EmbedPdfViewerProps) => {
  return <EmbedPdfViewerContent {...props} />;
};

export default EmbedPdfViewer;
