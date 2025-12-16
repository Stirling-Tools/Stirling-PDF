import { useEffect, useCallback, useState, useRef } from 'react';
import { Modal, Stack, Text, Badge, Box, Group, Alert } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useFrontendUrl } from '@app/hooks/useFrontendUrl';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { withBasePath } from '@app/constants/app';

interface MobileUploadModalProps {
  opened: boolean;
  onClose: () => void;
  onFilesReceived: (files: File[]) => void;
}

// Generate a UUID-like session ID
function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * MobileUploadModal
 *
 * Displays a QR code that mobile devices can scan to upload files via backend server.
 * Files are temporarily stored on server and retrieved by desktop.
 */
export default function MobileUploadModal({ opened, onClose, onFilesReceived }: MobileUploadModalProps) {
  const { t } = useTranslation();
  const frontendUrl = useFrontendUrl();

  const [sessionId] = useState(() => generateSessionId());
  const [filesReceived, setFilesReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const processedFiles = useRef<Set<string>>(new Set());

  // Use configured frontendUrl if set, otherwise use current origin
  // Combine with base path and mobile-scanner route
  const mobileUrl = `${frontendUrl}${withBasePath('/mobile-scanner')}?session=${sessionId}`;

  const pollForFiles = useCallback(async () => {
    if (!opened) return;

    try {
      const response = await fetch(`/api/v1/mobile-scanner/files/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to check for files');
      }

      const data = await response.json();
      const files = data.files || [];

      // Download only files we haven't processed yet
      const newFiles = files.filter((f: any) => !processedFiles.current.has(f.filename));

      if (newFiles.length > 0) {
        for (const fileMetadata of newFiles) {
          try {
            const downloadResponse = await fetch(
              `/api/v1/mobile-scanner/download/${sessionId}/${fileMetadata.filename}`
            );

            if (downloadResponse.ok) {
              const blob = await downloadResponse.blob();
              const file = new File([blob], fileMetadata.filename, {
                type: fileMetadata.contentType || 'image/jpeg'
              });

              processedFiles.current.add(fileMetadata.filename);
              setFilesReceived((prev) => prev + 1);
              onFilesReceived([file]);
            }
          } catch (err) {
            console.error('Failed to download file:', fileMetadata.filename, err);
          }
        }

        // Delete the entire session immediately after downloading all files
        // This ensures files are only on server for ~1 second
        try {
          await fetch(`/api/v1/mobile-scanner/session/${sessionId}`, { method: 'DELETE' });
          console.log('Session cleaned up after file download');
        } catch (cleanupErr) {
          console.warn('Failed to cleanup session after download:', cleanupErr);
        }
      }
    } catch (err) {
      console.error('Error polling for files:', err);
      setError(t('mobileUpload.pollingError', 'Error checking for files'));
    }
  }, [opened, sessionId, onFilesReceived, t]);

  // Start polling when modal opens
  useEffect(() => {
    if (opened) {
      setFilesReceived(0);
      setError(null);
      processedFiles.current.clear();

      // Poll every 2 seconds
      pollIntervalRef.current = window.setInterval(pollForFiles, 2000);

      // Initial poll
      pollForFiles();
    } else {
      // Stop polling when modal closes
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [opened, pollForFiles]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('mobileUpload.title', 'Upload from Mobile')}
      centered
      size="md"
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
    >
      <Stack gap="md">
        <Alert
          icon={<InfoRoundedIcon style={{ fontSize: '1rem' }} />}
          color="blue"
          variant="light"
        >
          <Text size="sm">
            {t(
              'mobileUpload.description',
              'Scan this QR code with your mobile device to upload photos directly to this page.'
            )}
          </Text>
        </Alert>

        {error && (
          <Alert
            icon={<ErrorRoundedIcon style={{ fontSize: '1rem' }} />}
            title={t('mobileUpload.error', 'Connection Error')}
            color="red"
          >
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Box
            style={{
              padding: '1.5rem',
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <QRCodeSVG value={mobileUrl} size={256} level="H" includeMargin />
          </Box>

          <Group gap="xs">
            <Text size="sm" c="dimmed">
              {t('mobileUpload.sessionId', 'Session ID')}:
            </Text>
            <Badge variant="light" color="blue" size="lg">
              {sessionId}
            </Badge>
          </Group>

          {filesReceived > 0 && (
            <Badge variant="filled" color="green" size="lg" leftSection={<CheckRoundedIcon style={{ fontSize: '1rem' }} />}>
              {t('mobileUpload.filesReceived', '{{count}} file(s) received', { count: filesReceived })}
            </Badge>
          )}

          <Text size="xs" c="dimmed" ta="center" style={{ maxWidth: '300px' }}>
            {t(
              'mobileUpload.instructions',
              'Open the camera app on your phone and scan this code. Files will be uploaded through the server.'
            )}
          </Text>

          <Text
            size="xs"
            c="dimmed"
            style={{
              wordBreak: 'break-all',
              textAlign: 'center',
              fontFamily: 'monospace',
            }}
          >
            {mobileUrl}
          </Text>
        </Box>
      </Stack>
    </Modal>
  );
}
