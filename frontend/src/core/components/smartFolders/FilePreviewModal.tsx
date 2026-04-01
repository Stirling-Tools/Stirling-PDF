import { useEffect, useState } from 'react';
import { Modal, Center, Text, Box, Loader } from '@mantine/core';
import { FileId } from '@app/types/fileContext';
import { fileStorage } from '@app/services/fileStorage';
import { LocalEmbedPDF } from '@app/components/viewer/LocalEmbedPDF';
import { PdfViewerToolbar } from '@app/components/viewer/PdfViewerToolbar';
import { ViewerProvider } from '@app/contexts/ViewerContext';

interface FilePreviewModalProps {
  fileId?: FileId | null;
  /** Pass a File directly (e.g. server-folder outputs not stored in IDB). */
  file?: File | null;
  fileName: string;
  onClose: () => void;
}

export function FilePreviewModal({ fileId, file: fileProp, fileName, onClose }: FilePreviewModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (fileProp) { setFile(fileProp); setError(false); setLoading(false); return; }
    if (!fileId) { setFile(null); setError(false); setLoading(false); return; }
    setError(false);
    setLoading(true);
    fileStorage.getStirlingFile(fileId)
      .then(f => {
        if (f) setFile(f);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [fileId, fileProp]);

  const opened = !!(fileId || fileProp);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={fileName}
      size="90%"
      zIndex={400}
      styles={{ body: { height: '82vh', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
    >
      {loading ? (
        <Center h="100%"><Loader size="sm" /></Center>
      ) : error ? (
        <Center h="100%">
          <Text c="dimmed">Could not load file preview.</Text>
        </Center>
      ) : !file ? (
        <Center h="100%"><Loader size="sm" /></Center>
      ) : (
        <ViewerProvider>
          <PdfViewerToolbar />
          <Box style={{ flex: 1, minHeight: 0 }}>
            <LocalEmbedPDF file={file} fileName={fileName} />
          </Box>
        </ViewerProvider>
      )}
    </Modal>
  );
}
