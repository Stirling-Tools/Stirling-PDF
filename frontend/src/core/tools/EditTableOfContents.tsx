import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { alert } from '@app/components/toast';
import { createToolFlow } from '@app/components/tools/shared/createToolFlow';
import EditTableOfContentsWorkbenchView, { EditTableOfContentsWorkbenchViewData } from '@app/components/tools/editTableOfContents/EditTableOfContentsWorkbenchView';
import EditTableOfContentsSettings from '@app/components/tools/editTableOfContents/EditTableOfContentsSettings';
import { useEditTableOfContentsParameters } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsParameters';
import { useEditTableOfContentsOperation } from '@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { useBaseTool } from '@app/hooks/tools/shared/useBaseTool';
import apiClient from '@app/services/apiClient';
import { BookmarkPayload, BookmarkNode, hydrateBookmarkPayload, serializeBookmarkNodes } from '@app/utils/editTableOfContents';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import { useFileSelection } from '@app/contexts/FileContext';

const extractBookmarks = async (file: File): Promise<BookmarkPayload[]> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post('/api/v1/general/extract-bookmarks', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data as BookmarkPayload[];
};

const useStableCallback = <T extends (...args: any[]) => any>(callback: T): T => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(() => ((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
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
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  } = useToolWorkflow();
  const { openFilesModal } = useFilesModalContext();
  const { clearSelections } = useFileSelection();
  const navigationState = useNavigationState();
  const { actions: navigationActions } = useNavigationActions();

  const WORKBENCH_VIEW_ID = 'editTableOfContentsWorkbench';
  const WORKBENCH_ID = 'custom:editTableOfContents' as const;
  const viewIcon = useMemo(() => <LocalIcon icon="menu-book-rounded" width={20} height={20} />, []);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [lastLoadedFileId, setLastLoadedFileId] = useState<string | null>(null);
  const hasAutoOpenedWorkbenchRef = useRef(false);

  const selectedFile = base.selectedFiles[0];

  const { setBookmarks } = base.params;

  useEffect(() => {
    registerCustomWorkbenchView({
      id: WORKBENCH_VIEW_ID,
      workbenchId: WORKBENCH_ID,
      label: 'Outline workspace',
      icon: viewIcon,
      component: EditTableOfContentsWorkbenchView,
    });

    return () => {
      clearCustomWorkbenchViewData(WORKBENCH_VIEW_ID);
      unregisterCustomWorkbenchView(WORKBENCH_VIEW_ID);
    };
  // Register once; avoid re-registering which clears data mid-flight
  }, []);

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
    // Don't auto-load bookmarks if we have results - user is viewing the output
    if (base.hasResults) {
      return;
    }

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
  }, [selectedFile, lastLoadedFileId, loadBookmarksForFile, setBookmarks, base.hasResults]);

  const importJsonCallback = async (file: File) => {
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
  };
  const handleImportJson = useStableCallback(importJsonCallback);

  const importClipboardCallback = async () => {
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
  };
  const handleImportClipboard = useStableCallback(importClipboardCallback);

  const exportJsonCallback = () => {
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
  };
  const handleExportJson = useStableCallback(exportJsonCallback);

  const exportClipboardCallback = async () => {
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
  };
  const handleExportClipboard = useStableCallback(exportClipboardCallback);

  const clipboardReadAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);
  const clipboardWriteAvailable = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

  const loadFromSelectedCallback = () => {
    if (selectedFile) {
      loadBookmarksForFile(selectedFile, { showToast: true });
    }
  };
  const handleLoadFromSelected = useStableCallback(loadFromSelectedCallback);

  const replaceExistingCallback = (value: boolean) => {
    base.params.updateParameter('replaceExisting', value);
  };
  const handleReplaceExistingChange = useStableCallback(replaceExistingCallback);

  const bookmarksChangeCallback = (bookmarks: BookmarkNode[]) => {
    setBookmarks(bookmarks);
  };
  const handleBookmarksChange = useStableCallback(bookmarksChangeCallback);

  const executeCallback = () => {
    void base.handleExecute();
  };
  const handleExecute = useStableCallback(executeCallback);

  const undoCallback = () => {
    base.handleUndo();
  };
  const handleUndo = useStableCallback(undoCallback);

  const clearErrorCallback = () => {
    base.operation.clearError();
  };
  const handleClearError = useStableCallback(clearErrorCallback);

  const fileClickCallback = (file: File) => {
    base.handleThumbnailClick(file);
  };
  const handleFileClick = useStableCallback(fileClickCallback);

  const selectFilesCallback = () => {
    // Clear existing selection first so the new file replaces instead of adds
    clearSelections();
    openFilesModal();
  };
  const handleSelectFiles = useStableCallback(selectFilesCallback);

  // Always keep workbench data updated
  useEffect(() => {
    const data: EditTableOfContentsWorkbenchViewData = {
      bookmarks: base.params.parameters.bookmarks,
      selectedFileName: selectedFile?.name,
      disabled: base.endpointLoading || base.operation.isLoading,
      files: base.operation.files ?? [],
      thumbnails: base.operation.thumbnails ?? [],
      downloadUrl: base.operation.downloadUrl ?? null,
      downloadFilename: base.operation.downloadFilename ?? null,
      errorMessage: base.operation.errorMessage ?? null,
      isGeneratingThumbnails: base.operation.isGeneratingThumbnails,
      isExecuteDisabled:
        !selectedFile ||
        !base.hasFiles ||
        base.endpointEnabled === false ||
        base.operation.isLoading ||
        base.endpointLoading,
      isExecuting: base.operation.isLoading,
      onClearError: handleClearError,
      onBookmarksChange: handleBookmarksChange,
      onExecute: handleExecute,
      onUndo: handleUndo,
      onFileClick: handleFileClick,
    };

    setCustomWorkbenchViewData(WORKBENCH_VIEW_ID, data);
  }, [
    WORKBENCH_VIEW_ID,
    base.endpointEnabled,
    base.endpointLoading,
    base.hasFiles,
    base.operation.downloadFilename,
    base.operation.downloadUrl,
    base.operation.errorMessage,
    base.operation.files,
    base.operation.isGeneratingThumbnails,
    base.operation.isLoading,
    base.operation.thumbnails,
    base.params.parameters.bookmarks,
    handleBookmarksChange,
    handleClearError,
    handleExecute,
    handleFileClick,
    handleUndo,
    selectedFile,
    setCustomWorkbenchViewData,
  ]);

  // Auto-navigate to workbench when tool is selected
  useEffect(() => {
    if (navigationState.selectedTool !== 'editTableOfContents') {
      hasAutoOpenedWorkbenchRef.current = false;
      return;
    }

    if (hasAutoOpenedWorkbenchRef.current) {
      return;
    }

    hasAutoOpenedWorkbenchRef.current = true;
    // Use timeout to ensure data effect has run first
    setTimeout(() => {
      navigationActions.setWorkbench(WORKBENCH_ID);
    }, 0);
  }, [navigationActions, navigationState.selectedTool, WORKBENCH_ID]);

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: true,
      minFiles: 1,
      isVisible: false,
    },
    steps: [
      {
        title: t('editTableOfContents.settings.title', 'Bookmarks & outline'),
        isCollapsed: false,
        content: (
          <EditTableOfContentsSettings
            bookmarks={base.params.parameters.bookmarks}
            replaceExisting={base.params.parameters.replaceExisting}
            onReplaceExistingChange={handleReplaceExistingChange}
            onSelectFiles={handleSelectFiles}
            onLoadFromPdf={handleLoadFromSelected}
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
        ),
      },
    ],
    review: {
      isVisible: base.hasResults,
      operation: base.operation,
      title: t('editTableOfContents.results.title', 'Updated PDF with bookmarks'),
      onFileClick: base.handleThumbnailClick,
      onUndo: handleUndo,
    },
  });
};

(EditTableOfContents as any).tool = () => useEditTableOfContentsOperation;

export default EditTableOfContents as ToolComponent;
