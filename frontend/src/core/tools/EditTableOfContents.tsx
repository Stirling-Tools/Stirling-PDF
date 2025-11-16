import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { alert } from '@app/components/toast';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import EditTableOfContentsSettings from '@app/components/tools/editTableOfContents/EditTableOfContentsSettings';
import { useEditTableOfContentsParameters } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsParameters';
import { useEditTableOfContentsOperation } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import apiClient from '@app/services/apiClient';
import { BookmarkPayload, hydrateBookmarkPayload, serializeBookmarkNodes } from '@app/utils/editTableOfContents';

const extractBookmarks = async (file: File): Promise<BookmarkPayload[]> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post('/api/v1/general/extract-bookmarks', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data as BookmarkPayload[];
};

const EditTableOfContents = (props: BaseToolProps) => {
  const { t } = useTranslation();
  const base = useBaseTool(
    'edit-table-of-contents',
    useEditTableOfContentsParameters,
    useEditTableOfContentsOperation,
    props,
    { minFiles: 1 }
  );

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [lastLoadedFileId, setLastLoadedFileId] = useState<string | null>(null);

  const selectedFile = base.selectedFiles[0];

  const { setBookmarks } = base.params;

  const loadBookmarksForFile = useCallback(async (file: File, { showToast }: { showToast?: boolean } = {}) => {
    setIsLoadingBookmarks(true);
    setLoadError(null);

    try {
      const payload = await extractBookmarks(file);
      const bookmarks = hydrateBookmarkPayload(payload);
      setBookmarks(bookmarks);
      setLastLoadedFileId((file as any)?.fileId ?? file.name);

      if (showToast) {
        alert({
          title: t('editTableOfContents.messages.loadedTitle', 'Bookmarks extracted'),
          body: t('editTableOfContents.messages.loadedBody', 'Existing bookmarks from the PDF were loaded into the editor.'),
          alertType: 'success',
        });
      }

      if (bookmarks.length === 0) {
        setLoadError(t('editTableOfContents.messages.noBookmarks', 'No bookmarks were found in the selected PDF.'));
      }
    } catch (error) {
      console.error('Failed to load bookmarks', error);
      setLoadError(t('editTableOfContents.messages.loadFailed', 'Unable to extract bookmarks from the selected PDF.'));
    } finally {
      setIsLoadingBookmarks(false);
    }
  }, [setBookmarks, t]);

  useEffect(() => {
    if (!selectedFile) {
      setBookmarks([]);
      setLastLoadedFileId(null);
      setLoadError(null);
      return;
    }

    const fileId = (selectedFile as any)?.fileId ?? selectedFile.name;
    if (fileId === lastLoadedFileId) {
      return;
    }

    loadBookmarksForFile(selectedFile).catch(() => {
      // errors handled in hook
    });
  }, [selectedFile, lastLoadedFileId, loadBookmarksForFile, setBookmarks]);

  const handleImportJson = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as BookmarkPayload[];
      setBookmarks(hydrateBookmarkPayload(json));
      alert({
        title: t('editTableOfContents.messages.imported', 'Bookmarks imported'),
        body: t('editTableOfContents.messages.importedBody', 'Your JSON outline replaced the current editor contents.'),
        alertType: 'success',
      });
    } catch (error) {
      console.error('Failed to import JSON bookmarks', error);
      alert({
        title: t('editTableOfContents.messages.invalidJson', 'Invalid JSON structure'),
        body: t('editTableOfContents.messages.invalidJsonBody', 'Please provide a valid bookmark JSON file and try again.'),
        alertType: 'error',
      });
    }
  }, [setBookmarks, t]);

  const handleImportClipboard = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      alert({
        title: t('editTableOfContents.actions.clipboardUnavailable', 'Clipboard access unavailable'),
        alertType: 'warning',
      });
      return;
    }

    try {
      const clipboard = await navigator.clipboard.readText();
      const json = JSON.parse(clipboard) as BookmarkPayload[];
      setBookmarks(hydrateBookmarkPayload(json));
      alert({
        title: t('editTableOfContents.messages.imported', 'Bookmarks imported'),
        body: t('editTableOfContents.messages.importedClipboard', 'Clipboard data replaced the current bookmark list.'),
        alertType: 'success',
      });
    } catch (error) {
      console.error('Failed to import bookmarks from clipboard', error);
      alert({
        title: t('editTableOfContents.messages.invalidJson', 'Invalid JSON structure'),
        body: t('editTableOfContents.messages.invalidJsonBody', 'Please provide a valid bookmark JSON file and try again.'),
        alertType: 'error',
      });
    }
  }, [setBookmarks, t]);

  const handleExportJson = useCallback(() => {
    const data = JSON.stringify(serializeBookmarkNodes(base.params.parameters.bookmarks), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bookmarks.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    alert({
      title: t('editTableOfContents.messages.exported', 'JSON download ready'),
      alertType: 'success',
    });
  }, [base.params.parameters.bookmarks, t]);

  const handleExportClipboard = useCallback(async () => {
    if (!navigator.clipboard?.writeText) {
      alert({
        title: t('editTableOfContents.actions.clipboardUnavailable', 'Clipboard access unavailable'),
        alertType: 'warning',
      });
      return;
    }

    const data = JSON.stringify(serializeBookmarkNodes(base.params.parameters.bookmarks), null, 2);
    try {
      await navigator.clipboard.writeText(data);
      alert({
        title: t('editTableOfContents.messages.copied', 'Copied to clipboard'),
        body: t('editTableOfContents.messages.copiedBody', 'Bookmark JSON copied successfully.'),
        alertType: 'success',
      });
    } catch (error) {
      console.error('Failed to copy bookmarks', error);
      alert({
        title: t('editTableOfContents.messages.copyFailed', 'Copy failed'),
        alertType: 'error',
      });
    }
  }, [base.params.parameters.bookmarks, t]);

  const clipboardReadAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const clipboardWriteAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

  const settingsStep = (
    <EditTableOfContentsSettings
      bookmarks={base.params.parameters.bookmarks}
      replaceExisting={base.params.parameters.replaceExisting}
      onReplaceExistingChange={(value) => base.params.updateParameter('replaceExisting', value)}
      onBookmarksChange={(bookmarks) => setBookmarks(bookmarks)}
      onLoadFromPdf={() => selectedFile && loadBookmarksForFile(selectedFile, { showToast: true })}
      onImportJson={handleImportJson}
      onImportClipboard={handleImportClipboard}
      onExportJson={handleExportJson}
      onExportClipboard={handleExportClipboard}
      isLoading={isLoadingBookmarks}
      loadError={loadError}
      canReadClipboard={clipboardReadAvailable}
      canWriteClipboard={clipboardWriteAvailable}
      disabled={base.endpointLoading}
      selectedFileName={selectedFile?.name}
    />
  );

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: base.hasResults,
      minFiles: 1,
    },
    steps: [
      {
        title: t('editTableOfContents.settings.title', 'Bookmarks & outline'),
        isCollapsed: base.settingsCollapsed,
        onCollapsedClick: base.settingsCollapsed ? base.handleSettingsReset : undefined,
        content: settingsStep,
      },
    ],
    executeButton: {
      text: t('editTableOfContents.submit', 'Apply table of contents'),
      loadingText: t('loading'),
      onClick: base.handleExecute,
      isVisible: !base.hasResults,
      disabled: !base.hasFiles || !base.endpointEnabled,
    },
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('editTableOfContents.results.title', 'Updated PDF with bookmarks'),
      onFileClick: base.handleThumbnailClick,
      onUndo: base.handleUndo,
    },
  });
};

(EditTableOfContents as any).tool = () => useEditTableOfContentsOperation;

export default EditTableOfContents as ToolComponent;

