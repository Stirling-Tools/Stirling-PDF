import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import DownloadIcon from '@mui/icons-material/Download';
import LoginIcon from '@mui/icons-material/Login';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useFileActions } from '@app/contexts/FileContext';
import { useNavigationActions } from '@app/contexts/NavigationContext';
import { alert } from '@app/components/toast';
import {
  downloadShareLink,
  fetchShareLinkMetadata,
  importShareLinkToWorkbench,
  ShareLinkMetadata,
} from '@app/services/shareLinkImport';

type ShareLinkStatus = 'loading' | 'ready' | 'login' | 'forbidden' | 'notfound' | 'error';

export default function ShareLinkPage() {
  const { token } = useParams<{ token: string }>();
  const { actions } = useFileActions();
  const { actions: navActions } = useNavigationActions();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<ShareLinkStatus>('loading');
  const [metadata, setMetadata] = useState<ShareLinkMetadata | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const normalizedToken = useMemo(() => (token || '').trim(), [token]);
  const shareRole = (metadata?.accessRole || 'editor').toLowerCase();
  const canDownload = shareRole === 'editor';
  const canOpen = shareRole === 'editor';

  const loadMetadata = useCallback(async () => {
    if (!normalizedToken) {
      setStatus('notfound');
      return;
    }
    setStatus('loading');
    try {
      const data = await fetchShareLinkMetadata(normalizedToken);
      setMetadata(data);
      setStatus('ready');
    } catch (error: any) {
      const statusCode = error?.response?.status as number | undefined;
      if (statusCode === 401) {
        setStatus('login');
      } else if (statusCode === 403) {
        setStatus('forbidden');
      } else if (statusCode === 404) {
        setStatus('notfound');
      } else {
        setStatus('error');
      }
    }
  }, [normalizedToken]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const handleLogin = useCallback(() => {
    navigate('/login', {
      replace: true,
      state: { from: { pathname: `/share/${normalizedToken}` } },
    });
  }, [navigate, normalizedToken]);

  const handleDownload = useCallback(async () => {
    if (!normalizedToken || !canDownload) return;
    setIsWorking(true);
    try {
      const { blob, filename } = await downloadShareLink(normalizedToken);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'shared-file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      const statusCode = error?.response?.status as number | undefined;
      if (statusCode === 401) {
        setStatus('login');
      } else if (statusCode === 403) {
        setStatus('forbidden');
      } else if (statusCode === 404) {
        setStatus('notfound');
      } else {
        alert({
          alertType: 'error',
          title: t('storageShare.downloadFailed', 'Unable to download this file.'),
          expandable: false,
          durationMs: 3500,
        });
      }
    } finally {
      setIsWorking(false);
    }
  }, [canDownload, normalizedToken, t]);

  const handleOpen = useCallback(async () => {
    if (!normalizedToken || !canOpen) return;
    setIsWorking(true);
    try {
      const selectedIds = await importShareLinkToWorkbench(
        normalizedToken,
        actions,
        metadata
      );
      if (selectedIds.length > 0) {
        actions.setSelectedFiles(selectedIds);
      }
      navActions.setWorkbench('viewer');
      navigate('/', { replace: true });
    } catch (error: any) {
      const statusCode = error?.response?.status as number | undefined;
      if (statusCode === 401) {
        setStatus('login');
      } else if (statusCode === 403) {
        setStatus('forbidden');
      } else if (statusCode === 404) {
        setStatus('notfound');
      } else {
        alert({
          alertType: 'error',
          title: t('storageShare.loadFailed', 'Unable to open shared file.'),
          expandable: false,
          durationMs: 3500,
        });
      }
    } finally {
      setIsWorking(false);
    }
  }, [actions, canOpen, metadata, navActions, navigate, normalizedToken, t]);

  const title = metadata?.fileName || t('storageShare.titleDefault', 'Shared file');
  const ownerLabel = metadata?.owner || t('storageShare.ownerUnknown', 'Unknown');

  return (
    <div style={{ minHeight: '100%', padding: '2.5rem 1.5rem' }}>
      <Paper radius="lg" p="xl" withBorder shadow="sm" style={{ maxWidth: 720, margin: '0 auto' }}>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>{t('storageShare.shareHeading', 'Shared file')}</Title>
            <Group gap="xs">
              {metadata?.accessRole && (
                <Badge variant="light" color="gray">
                  {shareRole === 'editor'
                    ? t('storageShare.roleEditor', 'Editor')
                    : shareRole === 'commenter'
                      ? t('storageShare.roleCommenter', 'Commenter')
                      : t('storageShare.roleViewer', 'Viewer')}
                </Badge>
              )}
            </Group>
          </Group>

          {status === 'loading' && (
            <Group justify="center" py="xl">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                {t('storageShare.loading', 'Loading share link...')}
              </Text>
            </Group>
          )}

          {status === 'ready' && (
            <>
              <Text size="lg" fw={600}>
                {title}
              </Text>
              <Text size="sm" c="dimmed">
                {t('storageShare.ownerLabel', 'Owner')}: {ownerLabel}
              </Text>
              {metadata?.createdAt && (
                <Text size="sm" c="dimmed">
                  {t('storageShare.createdAt', 'Created')} {new Date(metadata.createdAt).toLocaleString()}
                </Text>
              )}
              <Group justify="flex-start" gap="sm" pt="sm">
                <Button
                  leftSection={<OpenInNewIcon style={{ fontSize: 18 }} />}
                  onClick={handleOpen}
                  loading={isWorking}
                  disabled={!canOpen}
                >
                  {t('storageShare.openInApp', 'Open in Stirling PDF')}
                </Button>
                <Button
                  variant="light"
                  leftSection={<DownloadIcon style={{ fontSize: 18 }} />}
                  onClick={handleDownload}
                  loading={isWorking}
                  disabled={!canDownload}
                >
                  {t('storageShare.download', 'Download')}
                </Button>
              </Group>
              {!canDownload && (
                <Alert mt="md" color="yellow" title={t('storageShare.accessLimitedTitle', 'Limited access')}>
                  {shareRole === 'commenter'
                    ? t(
                        'storageShare.accessLimitedCommenter',
                        'Comment access is coming soon. Ask the owner for editor access if you need to download.'
                      )
                    : t(
                        'storageShare.accessLimitedViewer',
                        'This link is view-only. Ask the owner for editor access if you need to download.'
                      )}
                </Alert>
              )}
            </>
          )}

          {status === 'login' && (
            <Alert color="blue" title={t('storageShare.loginRequired', 'Login required')}>
              <Text size="sm">
                {t('storageShare.loginPrompt', 'Sign in to access this shared file.')}
              </Text>
              <Group mt="md">
                <Button
                  leftSection={<LoginIcon style={{ fontSize: 18 }} />}
                  onClick={handleLogin}
                >
                  {t('storageShare.goToLogin', 'Go to login')}
                </Button>
              </Group>
            </Alert>
          )}

          {status === 'forbidden' && (
            <Alert color="red" title={t('storageShare.accessDeniedTitle', 'No access')}>
              {t(
                'storageShare.accessDeniedBody',
                'You do not have access to this file. Ask the owner to share it with you.'
              )}
            </Alert>
          )}

          {status === 'notfound' && (
            <Alert color="red" title={t('storageShare.expiredTitle', 'Link expired')}>
              {t('storageShare.expiredBody', 'This share link is invalid or has expired.')}
            </Alert>
          )}

          {status === 'error' && (
            <Alert color="red" title={t('storageShare.loadFailed', 'Unable to open shared file.')}>
              {t('storageShare.tryAgain', 'Please try again later.')}
            </Alert>
          )}
        </Stack>
      </Paper>
    </div>
  );
}
