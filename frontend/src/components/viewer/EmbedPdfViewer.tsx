import React from 'react';
import { Box, Center, Text, ActionIcon } from '@mantine/core';
import { useMantineTheme, useMantineColorScheme } from '@mantine/core';
import CloseIcon from '@mui/icons-material/Close';

import { useFileState } from "../../contexts/FileContext";
import { useFileWithUrl } from "../../hooks/useFileWithUrl";
import { ViewerProvider, useViewer } from "../../contexts/ViewerContext";
import { LocalEmbedPDF } from './LocalEmbedPDF';
import { PdfViewerToolbar } from './PdfViewerToolbar';
import { ThumbnailSidebar } from './ThumbnailSidebar';
import '../../types/embedPdf';

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
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const [isViewerHovered, setIsViewerHovered] = React.useState(false);
  const { isThumbnailSidebarVisible, toggleThumbnailSidebar } = useViewer();

  // Get current file from FileContext
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();

  // Determine which file to display
  const currentFile = React.useMemo(() => {
    if (previewFile) {
      return previewFile;
    } else if (activeFiles.length > 0) {
      return activeFiles[0]; // Use first file for simplicity
    }
    return null;
  }, [previewFile, activeFiles]);

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

  // Handle scroll wheel zoom
  React.useEffect(() => {
    let accumulator = 0;

    const handleWheel = (event: WheelEvent) => {
      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();

        // Convert smooth scrolling gestures into discrete notches
        accumulator += event.deltaY;
        const threshold = 10;

        const zoomAPI = window.embedPdfZoom;
        if (zoomAPI) {
          if (accumulator <= -threshold) {
            zoomAPI.zoomIn();
            accumulator = 0;
          } else if (accumulator >= threshold) {
            zoomAPI.zoomOut();
            accumulator = 0;
          }
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
  }, []);

  // Handle keyboard zoom shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isViewerHovered) return;

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed
      if (event.ctrlKey || event.metaKey) {
        const zoomAPI = window.embedPdfZoom;
        if (zoomAPI) {
          if (event.key === '=' || event.key === '+') {
            // Ctrl+= or Ctrl++ for zoom in
            event.preventDefault();
            zoomAPI.zoomIn();
          } else if (event.key === '-' || event.key === '_') {
            // Ctrl+- for zoom out
            event.preventDefault();
            zoomAPI.zoomOut();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isViewerHovered]);

  // Expose toggle functions globally for right rail buttons
  React.useEffect(() => {
    window.toggleThumbnailSidebar = toggleThumbnailSidebar;

    return () => {
      delete window.toggleThumbnailSidebar;
    };
  }, [toggleThumbnailSidebar]);

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
          {/* Tabs for multiple files */}
          {activeFiles.length > 1 && !previewFile && (
            <Box p="md" style={{ borderBottom: `1px solid ${theme.colors.gray[3]}` }}>
              <Text size="sm" c="dimmed">
                Multiple files loaded - showing first file for now
              </Text>
            </Box>
          )}

          {/* EmbedPDF Viewer */}
          <Box style={{
            position: 'relative',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0
          }}>
            <LocalEmbedPDF
              file={effectiveFile.file}
              url={effectiveFile.url}
              colorScheme={colorScheme}
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
              currentPage={1}
              totalPages={1}
              onPageChange={(page) => {
                // Placeholder - will implement page navigation later
                console.log('Navigate to page:', page);
              }}
              dualPage={false}
              onDualPageToggle={() => {
                window.embedPdfSpread?.toggleSpreadMode();
              }}
              currentZoom={100}
            />
          </div>
        </div>
      )}


      {/* Thumbnail Sidebar */}
      <ThumbnailSidebar
        visible={isThumbnailSidebarVisible}
        onToggle={toggleThumbnailSidebar}
        colorScheme={colorScheme}
      />
    </Box>
  );
};

const EmbedPdfViewer = (props: EmbedPdfViewerProps) => {
  return (
    <ViewerProvider>
      <EmbedPdfViewerContent {...props} />
    </ViewerProvider>
  );
};

export default EmbedPdfViewer;
