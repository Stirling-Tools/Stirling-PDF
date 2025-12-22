import { useEffect, useCallback, useState, useRef } from 'react';
import { Modal, Stack, Text, Badge, Box, Group, Alert, Progress } from '@mantine/core';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import { withBasePath } from '@app/constants/app';

interface MobileUploadModalProps {
  opened: boolean;
  onClose: () => void;
  onFilesReceived: (files: File[]) => void;
}

// Generate a cryptographically secure UUID v4-like session ID
function generateSessionId(): string {
  // Use Web Crypto API for cryptographically secure random values
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (window as any).crypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);

    // Set version (4) and variant bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

    // Convert bytes to hex string in UUID format
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }

  // Fallback for environments without Web Crypto (should not happen in modern browsers)
  console.warn('Web Crypto API not available, falling back to Math.random()');
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface SessionInfo {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  timeoutMs: number;
}

/**
 * MobileUploadModal
 *
 * Displays a QR code that mobile devices can scan to upload files via backend server.
 * Files are temporarily stored on server and retrieved by desktop.
 */
export default function MobileUploadModal({ opened, onClose, onFilesReceived }: MobileUploadModalProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();

  const [sessionId, setSessionId] = useState(() => generateSessionId());
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [filesReceived, setFilesReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const processedFiles = useRef<Set<string>>(new Set());

  // Use configured frontendUrl if set, otherwise use current origin
  // Combine with base path and mobile-scanner route
  const frontendUrl = config?.frontendUrl || window.location.origin;
  const mobileUrl = `${frontendUrl}${withBasePath('/mobile-scanner')}?session=${sessionId}`;

  // Create session on backend
  const createSession = useCallback(async (newSessionId: string) => {
    try {
      const response = await fetch(`/api/v1/mobile-scanner/create-session/${newSessionId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      setSessionInfo(data);
      setError(null);
      console.log('Session created:', data);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError(t('mobileUpload.sessionCreateError', 'Failed to create session'));
    }
  }, [t]);

  // Regenerate session (when expired or warned)
  const regenerateSession = useCallback(() => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    setShowExpiryWarning(false);
    setFilesReceived(0);
    processedFiles.current.clear();
    createSession(newSessionId);
  }, [createSession]);

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

  // Create session when modal opens
  useEffect(() => {
    if (opened) {
      createSession(sessionId);
      setFilesReceived(0);
      setError(null);
      setShowExpiryWarning(false);
      processedFiles.current.clear();
    } else {
      // Clean up session when modal closes
      if (sessionId) {
        fetch(`/api/v1/mobile-scanner/session/${sessionId}`, { method: 'DELETE' })
          .catch(err => console.warn('Failed to cleanup session on close:', err));
      }
    }
  }, [opened]); // Only run when opened changes

  // Start polling for files when modal opens
  useEffect(() => {
    if (opened && sessionInfo) {
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
  }, [opened, sessionInfo, pollForFiles]);

  // Session timeout timer
  useEffect(() => {
    if (!opened || !sessionInfo) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = sessionInfo.expiresAt - now;

      if (remaining <= 0) {
        // Session expired - regenerate
        setShowExpiryWarning(false);
        regenerateSession();
      } else if (remaining <= 60000 && !showExpiryWarning) {
        // Less than 1 minute remaining - show warning
        setShowExpiryWarning(true);
      }

      setTimeRemaining(Math.max(0, remaining));
    };

    // Update immediately
    updateTimer();

    // Update every second
    timerIntervalRef.current = window.setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [opened, sessionInfo, showExpiryWarning, regenerateSession]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('mobileUpload.title', 'Upload from Mobile')}
      centered
      size="md"
      radius="lg"
      zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      overlayProps={{ opacity: 0.35, blur: 2 }}
      styles={{
        body: {
          paddingTop: '1.5rem',
        },
      }}
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

        {showExpiryWarning && timeRemaining !== null && (
          <Alert
            icon={<WarningRoundedIcon style={{ fontSize: '1rem' }} />}
            title={t('mobileUpload.expiryWarning', 'Session Expiring Soon')}
            color="orange"
          >
            <Text size="sm">
              {t(
                'mobileUpload.expiryWarningMessage',
                'This QR code will expire in {{seconds}} seconds. A new code will be generated automatically.',
                { seconds: Math.ceil(timeRemaining / 1000) }
              )}
            </Text>
          </Alert>
        )}

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
