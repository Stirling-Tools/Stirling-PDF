import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Box, ScrollArea, Text, ActionIcon, Loader, Stack, TextInput } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useViewer } from '@app/contexts/ViewerContext';
import { PdfAttachmentObject } from '@embedpdf/models';
import AttachmentIcon from '@mui/icons-material/AttachmentRounded';
import DownloadIcon from '@mui/icons-material/DownloadRounded';
import { useTranslation } from 'react-i18next';
import '@app/components/viewer/AttachmentSidebar.css';

interface AttachmentSidebarProps {
  visible: boolean;
  thumbnailVisible: boolean;
  documentCacheKey?: string;
  preloadCacheKeys?: string[];
}

const SIDEBAR_WIDTH = '15rem';

interface AttachmentCacheEntry {
  status: 'idle' | 'loading' | 'success' | 'error';
  attachments: PdfAttachmentObject[] | null;
  error: string | null;
  lastFetched: number | null;
}

const createEntry = (overrides: Partial<AttachmentCacheEntry> = {}): AttachmentCacheEntry => ({
  status: 'idle',
  attachments: null,
  error: null,
  lastFetched: null,
  ...overrides,
});

export const AttachmentSidebar = ({ visible, thumbnailVisible, documentCacheKey, preloadCacheKeys = [] }: AttachmentSidebarProps) => {
  const { t } = useTranslation();
  const { attachmentActions, hasAttachmentSupport } = useViewer();
  const [searchTerm, setSearchTerm] = useState('');
  const [attachmentSupport, setAttachmentSupport] = useState(() => hasAttachmentSupport());
  const [activeEntry, setActiveEntry] = useState<AttachmentCacheEntry>(() => createEntry());
  const cacheRef = useRef<Map<string, AttachmentCacheEntry>>(new Map());
  const [fetchNonce, setFetchNonce] = useState(0);
  const currentKeyRef = useRef<string | null>(documentCacheKey ?? null);

  useEffect(() => {
    currentKeyRef.current = documentCacheKey ?? null;
  }, [documentCacheKey]);

  // Poll once until the attachment bridge registers
  useEffect(() => {
    if (attachmentSupport) return;
    let cancelled = false;
    const id = setInterval(() => {
      if (!cancelled && hasAttachmentSupport()) {
        setAttachmentSupport(true);
        clearInterval(id);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [attachmentSupport, hasAttachmentSupport]);

  // Reset UI and load cached entry (if any) when switching documents
  useEffect(() => {
    setSearchTerm('');

    if (!documentCacheKey) {
      setActiveEntry(createEntry());
      attachmentActions.clearAttachments();
      return;
    }

    const cached = cacheRef.current.get(documentCacheKey);
    if (cached) {
      setActiveEntry(cached);
      if (cached.status === 'success') {
        attachmentActions.setLocalAttachments(cached.attachments ?? [], null);
      } else if (cached.status === 'error') {
        attachmentActions.setLocalAttachments(cached.attachments ?? null, cached.error);
      } else {
        attachmentActions.clearAttachments();
      }
    } else {
      setActiveEntry(createEntry());
      attachmentActions.clearAttachments();
    }
  }, [documentCacheKey, attachmentActions]);

  // Keep cache bounded to the currently relevant keys
  useEffect(() => {
    const allowed = new Set<string>();
    if (documentCacheKey) {
      allowed.add(documentCacheKey);
    }
    preloadCacheKeys.forEach(key => {
      if (key) {
        allowed.add(key);
      }
    });

    cacheRef.current.forEach((_entry, key) => {
      if (!allowed.has(key)) {
        cacheRef.current.delete(key);
      }
    });
  }, [documentCacheKey, preloadCacheKeys]);

  // Fetch attachments for the active document when needed
  useEffect(() => {
    if (!attachmentSupport || !documentCacheKey) return;

    const key = documentCacheKey;
    const cached = cacheRef.current.get(key);
    if (cached && (cached.status === 'loading' || cached.status === 'success')) {
      return;
    }

    let cancelled = false;
    const updateEntry = (entry: AttachmentCacheEntry) => {
      cacheRef.current.set(key, entry);
      if (!cancelled && currentKeyRef.current === key) {
        setActiveEntry(entry);
      }
    };

    updateEntry(createEntry({
      status: 'loading',
      attachments: cached?.attachments ?? null,
      lastFetched: cached?.lastFetched ?? null,
    }));

    const fetchWithRetry = async () => {
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await attachmentActions.getAttachments();
          return Array.isArray(result) ? result : [];
        } catch (error: any) {
          const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
          const notReady =
            message.includes('document') &&
            message.includes('not') &&
            message.includes('open');

          if (!notReady || attempt === maxAttempts - 1) {
            throw error;
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      return [];
    };

    fetchWithRetry()
      .then(attachments => {
        if (cancelled) return;
        const entry = createEntry({
          status: 'success',
          attachments,
          lastFetched: Date.now(),
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          attachmentActions.setLocalAttachments(attachments, null);
        }
      })
      .catch(error => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load attachments';
        const fallback = cacheRef.current.get(key);
        const entry = createEntry({
          status: 'error',
          attachments: fallback?.attachments ?? null,
          error: message,
          lastFetched: fallback?.lastFetched ?? null,
        });
        updateEntry(entry);
        if (currentKeyRef.current === key) {
          attachmentActions.setLocalAttachments(null, message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentSupport, documentCacheKey, fetchNonce, attachmentActions]);

  const requestReload = useCallback(() => {
    if (!documentCacheKey) return;
    cacheRef.current.delete(documentCacheKey);
    setActiveEntry(createEntry());
    attachmentActions.clearAttachments();
    setFetchNonce(value => value + 1);
  }, [documentCacheKey, attachmentActions]);

  const handleDownload = (attachment: PdfAttachmentObject, event: React.MouseEvent) => {
    event.stopPropagation();
    attachmentActions.downloadAttachment(attachment);
  };

  const filteredAttachments = useMemo(() => {
    const attachments = Array.isArray(activeEntry.attachments) ? activeEntry.attachments : [];
    if (!searchTerm.trim()) return attachments;
    const term = searchTerm.trim().toLowerCase();
    return attachments.filter(a => a.name?.toLowerCase().includes(term));
  }, [activeEntry.attachments, searchTerm]);

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderAttachments = (attachments: PdfAttachmentObject[]) => {
    return attachments.map((attachment, index) => (
      <div key={`${attachment.name}-${index}`} className="attachment-item-wrapper">
        <div
          className="attachment-item"
          onClick={(event) => handleDownload(attachment, event)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleDownload(attachment, event as any);
            }
          }}
        >
          <div className="attachment-item__content">
            <Text size="sm" fw={500} className="attachment-item__title">
              {attachment.name || 'Untitled'}
            </Text>
            {(attachment.size !== undefined || attachment.description) && (
              <Text size="xs" c="dimmed" className="attachment-item__meta">
                {[formatFileSize(attachment.size), attachment.description].filter(Boolean).join(' • ')}
              </Text>
            )}
          </div>
          <ActionIcon
            variant="subtle"
            size="sm"
            className="attachment-item__download-icon"
            onClick={(event) => handleDownload(attachment, event)}
          >
            <DownloadIcon sx={{ fontSize: '1.2rem' }} />
          </ActionIcon>
        </div>
      </div>
    ));
  };

  if (!visible) {
    return null;
  }

  const isSearchActive = searchTerm.trim().length > 0;
  const hasAttachments = Array.isArray(activeEntry.attachments) && activeEntry.attachments.length > 0;
  const isLocalLoading = attachmentSupport && activeEntry.status === 'loading';
  const currentError = attachmentSupport && activeEntry.status === 'error' ? activeEntry.error : null;

  const showAttachmentList = attachmentSupport && documentCacheKey && filteredAttachments.length > 0;
  const showEmptyState =
    attachmentSupport &&
    documentCacheKey &&
    !isLocalLoading &&
    !currentError &&
    activeEntry.status === 'success' &&
    !hasAttachments;
  const showSearchEmpty =
    attachmentSupport &&
    documentCacheKey &&
    isSearchActive &&
    hasAttachments &&
    filteredAttachments.length === 0;
  const showNoDocument = attachmentSupport && !documentCacheKey;

  return (
    <Box
      className="attachment-sidebar"
      style={{
        position: 'fixed',
        right: thumbnailVisible ? SIDEBAR_WIDTH : 0,
        top: 0,
        bottom: 0,
        width: SIDEBAR_WIDTH,
        zIndex: 998,
      }}
    >
      <div className="attachment-sidebar__header">
        <div className="attachment-sidebar__header-title">
          <span className="attachment-sidebar__header-icon">
            <AttachmentIcon />
          </span>
          <Text fw={600} size="sm" tt="uppercase" lts={0.5}>
            {t('viewer.attachments.title', 'Attachments')}
          </Text>
        </div>
      </div>

      <Box px="sm" pb="sm" className="attachment-sidebar__search">
        <TextInput
          value={searchTerm}
          placeholder={t('viewer.attachments.searchPlaceholder', 'Search attachments')}
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          leftSection={<LocalIcon icon="search" width="1.1rem" height="1.1rem" />}
          size="xs"
        />
      </Box>

      <ScrollArea style={{ flex: 1 }}>
        <Box p="sm" className="attachment-sidebar__content">
          {!attachmentSupport && (
            <div className="attachment-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                {t('viewer.attachments.noSupport', 'Attachment support is unavailable for this viewer.')}
              </Text>
            </div>
          )}

          {attachmentSupport && showNoDocument && (
            <div className="attachment-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                {t('viewer.attachments.noDocument', 'Open a PDF to view its attachments.')}
              </Text>
            </div>
          )}

          {attachmentSupport && documentCacheKey && currentError && (
            <Stack gap="xs" align="center" className="attachment-sidebar__error">
              <Text size="sm" c="red" ta="center">
                {currentError}
              </Text>
              <ActionIcon variant="light" onClick={requestReload}>
                <LocalIcon icon="refresh" />
              </ActionIcon>
            </Stack>
          )}

          {attachmentSupport && documentCacheKey && isLocalLoading && (
            <Stack gap="md" align="center" c="dimmed" py="xl" className="attachment-sidebar__loading">
              <Loader size="md" type="dots" />
              <Text size="sm" ta="center">
                {t('viewer.attachments.loading', 'Loading attachments...')}
              </Text>
            </Stack>
          )}

          {showEmptyState && (
            <div className="attachment-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                {t('viewer.attachments.empty', 'No attachments in this document')}
              </Text>
            </div>
          )}

          {showAttachmentList && (
            <div className="attachment-list">
              {renderAttachments(filteredAttachments)}
            </div>
          )}

          {showSearchEmpty && (
            <div className="attachment-sidebar__empty-state">
              <Text size="sm" c="dimmed" ta="center">
                {t('viewer.attachments.noMatch', 'No attachments match your search')}
              </Text>
            </div>
          )}
        </Box>
      </ScrollArea>
    </Box>
  );
};
