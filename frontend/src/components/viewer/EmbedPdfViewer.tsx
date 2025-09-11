import React from 'react';
import { Box, Center, Text, ActionIcon, Tabs } from '@mantine/core';
import { useMantineTheme, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';

import { useFileState } from "../../contexts/FileContext";
import { useFileWithUrl } from "../../hooks/useFileWithUrl";
import { LocalEmbedPDF } from './LocalEmbedPDF';
import { PdfViewerToolbar } from './PdfViewerToolbar';

export interface EmbedPdfViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
}

const EmbedPdfViewer = ({
  sidebarsVisible,
  setSidebarsVisible,
  onClose,
  previewFile,
}: EmbedPdfViewerProps) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();

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

  return (
    <Box style={{ 
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

          {/* EmbedPDF Viewer with Toolbar Overlay */}
          <Box style={{ 
            position: 'relative', 
            flex: 1, 
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <LocalEmbedPDF
              file={effectiveFile.file}
              url={effectiveFile.url}
              colorScheme={colorScheme}
            />
            
            {/* Bottom Toolbar Overlay */}
            <div
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 50,
                display: "flex",
                justifyContent: "center",
                pointerEvents: "none",
                background: "transparent",
                marginTop: "auto",
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
                    (window as any).embedPdfSpread?.toggleSpreadMode();
                  }}
                  currentZoom={100}
                />
              </div>
            </div>
          </Box>
        </>
      )}
    </Box>
  );
};

export default EmbedPdfViewer;