import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';

import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileSelection } from '@app/contexts/FileContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { CONVERSION_ENDPOINTS } from '@app/constants/convertConstants';
import apiClient from '@app/services/apiClient';
import { downloadBlob, downloadTextAsFile } from '@app/utils/downloadUtils';
import { getFilenameFromHeaders } from '@app/utils/fileResponseUtils';
import {
  PdfJsonDocument,
  PdfJsonImageElement,
  TextGroup,
  PdfJsonEditorViewData,
} from './pdfJsonEditorTypes';
import {
  deepCloneDocument,
  getDirtyPages,
  groupDocumentText,
  restoreGlyphElements,
  extractDocumentImages,
  cloneImageElement,
  valueOr,
} from './pdfJsonEditorUtils';
import PdfJsonEditorView from '@app/components/tools/pdfJsonEditor/PdfJsonEditorView';

const VIEW_ID = 'pdfJsonEditorView';
const WORKBENCH_ID = 'custom:pdfJsonEditor' as const;

const sanitizeBaseName = (name?: string | null): string => {
  if (!name || name.trim().length === 0) {
    return 'document';
  }
  return name.replace(/\.[^.]+$/u, '');
};

const getAutoLoadKey = (file: File): string => {
  const withId = file as File & { fileId?: string; quickKey?: string };
  if (withId.fileId && typeof withId.fileId === 'string') {
    return withId.fileId;
  }
  if (withId.quickKey && typeof withId.quickKey === 'string') {
    return withId.quickKey;
  }
  return `${file.name}|${file.size}|${file.lastModified}`;
};

const PdfJsonEditor = ({ onComplete, onError }: BaseToolProps) => {
  const { t } = useTranslation();
  const {
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
    setLeftPanelView,
  } = useToolWorkflow();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();

  const [loadedDocument, setLoadedDocument] = useState<PdfJsonDocument | null>(null);
  const [groupsByPage, setGroupsByPage] = useState<TextGroup[][]>([]);
  const [imagesByPage, setImagesByPage] = useState<PdfJsonImageElement[][]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const originalImagesRef = useRef<PdfJsonImageElement[][]>([]);
  const autoLoadKeyRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const latestPdfRequestIdRef = useRef<number | null>(null);

  const dirtyPages = useMemo(
    () => getDirtyPages(groupsByPage, imagesByPage, originalImagesRef.current),
    [groupsByPage, imagesByPage],
  );
  const hasChanges = useMemo(() => dirtyPages.some(Boolean), [dirtyPages]);
  const hasDocument = loadedDocument !== null;
  const viewLabel = useMemo(() => t('pdfJsonEditor.viewLabel', 'PDF Editor'), [t]);
  const { selectedFiles } = useFileSelection();

  const resetToDocument = useCallback((document: PdfJsonDocument | null) => {
    if (!document) {
      setGroupsByPage([]);
      setImagesByPage([]);
      originalImagesRef.current = [];
      setSelectedPage(0);
      return;
    }
    const cloned = deepCloneDocument(document);
    const groups = groupDocumentText(cloned);
    const images = extractDocumentImages(cloned);
    originalImagesRef.current = images.map((page) => page.map(cloneImageElement));
    setGroupsByPage(groups);
    setImagesByPage(images);
    setSelectedPage(0);
  }, []);

  const handleLoadFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }

      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      const fileKey = getAutoLoadKey(file);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      try {
        let parsed: PdfJsonDocument;

        setErrorMessage(null);

        if (isPdf) {
          latestPdfRequestIdRef.current = requestId;
          setIsConverting(true);

          const formData = new FormData();
          formData.append('fileInput', file);

          const response = await apiClient.post(CONVERSION_ENDPOINTS['pdf-json'], formData, {
            responseType: 'blob',
          });

          const jsonText = await response.data.text();
          parsed = JSON.parse(jsonText) as PdfJsonDocument;
        } else {
          const content = await file.text();
          parsed = JSON.parse(content) as PdfJsonDocument;
        }

        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        setLoadedDocument(parsed);
        resetToDocument(parsed);
        setFileName(file.name);
        setErrorMessage(null);
        autoLoadKeyRef.current = fileKey;
      } catch (error) {
        console.error('Failed to load file', error);

        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        setLoadedDocument(null);
        resetToDocument(null);

        if (isPdf) {
          setErrorMessage(
            t('pdfJsonEditor.conversionFailed', 'Failed to convert PDF. Please try again.')
          );
        } else {
          setErrorMessage(
            t(
              'pdfJsonEditor.errors.invalidJson',
              'Unable to read the JSON file. Ensure it was generated by the PDF to JSON tool.'
            )
          );
        }
      } finally {
        if (isPdf && latestPdfRequestIdRef.current === requestId) {
          setIsConverting(false);
        }
      }
    },
    [resetToDocument, t]
  );

  const handleSelectPage = useCallback((pageIndex: number) => {
    setSelectedPage(pageIndex);
  }, []);

  const handleGroupTextChange = useCallback((pageIndex: number, groupId: string, value: string) => {
    setGroupsByPage((previous) =>
      previous.map((groups, idx) =>
        idx !== pageIndex
          ? groups
          : groups.map((group) => (group.id === groupId ? { ...group, text: value } : group))
      )
    );
  }, []);

  const handleImageTransform = useCallback(
    (
      pageIndex: number,
      imageId: string,
      next: { left: number; bottom: number; width: number; height: number; transform: number[] },
    ) => {
      setImagesByPage((previous) =>
        previous.map((images, idx) => {
          if (idx !== pageIndex) {
            return images;
          }
          let changed = false;
          const updated = images.map((image) => {
            if ((image.id ?? '') !== imageId) {
              return image;
            }
            const originalTransform = image.transform ?? originalImagesRef.current[idx]?.find((base) => (base.id ?? '') === imageId)?.transform;
            const scaleXSign = originalTransform && originalTransform.length >= 6 ? Math.sign(originalTransform[0]) || 1 : 1;
            const scaleYSign = originalTransform && originalTransform.length >= 6 ? Math.sign(originalTransform[3]) || 1 : 1;
            const right = next.left + next.width;
            const top = next.bottom + next.height;
            const updatedImage: PdfJsonImageElement = {
              ...image,
              x: next.left,
              y: next.bottom,
              left: next.left,
              bottom: next.bottom,
              right,
              top,
              width: next.width,
              height: next.height,
              transform: scaleXSign < 0 || scaleYSign < 0 ? [
                next.width * scaleXSign,
                0,
                0,
                next.height * scaleYSign,
                next.left,
                scaleYSign >= 0 ? next.bottom : next.bottom + next.height,
              ] : null,
            };

            const isSame =
              Math.abs(valueOr(image.left, 0) - next.left) < 1e-4 &&
              Math.abs(valueOr(image.bottom, 0) - next.bottom) < 1e-4 &&
              Math.abs(valueOr(image.width, 0) - next.width) < 1e-4 &&
              Math.abs(valueOr(image.height, 0) - next.height) < 1e-4;

            if (!isSame) {
              changed = true;
            }
            return updatedImage;
          });
          return changed ? updated : images;
        }),
      );
    },
    [],
  );

  const handleImageReset = useCallback((pageIndex: number, imageId: string) => {
    const baseline = originalImagesRef.current[pageIndex]?.find((image) => (image.id ?? '') === imageId);
    if (!baseline) {
      return;
    }
    setImagesByPage((previous) =>
      previous.map((images, idx) => {
        if (idx !== pageIndex) {
          return images;
        }
        return images.map((image) => ((image.id ?? '') === imageId ? cloneImageElement(baseline) : image));
      }),
    );
  }, []);

  const handleResetEdits = useCallback(() => {
    if (!loadedDocument) {
      return;
    }
    resetToDocument(loadedDocument);
    setErrorMessage(null);
  }, [loadedDocument, resetToDocument]);

  const buildPayload = useCallback(() => {
    if (!loadedDocument) {
      return null;
    }

    const updatedDocument = restoreGlyphElements(
      loadedDocument,
      groupsByPage,
      imagesByPage,
      originalImagesRef.current,
    );
    const baseName = sanitizeBaseName(fileName || loadedDocument.metadata?.title || undefined);
    return {
      document: updatedDocument,
      filename: `${baseName}.json`,
    };
  }, [fileName, groupsByPage, imagesByPage, loadedDocument]);

  const handleDownloadJson = useCallback(() => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    const { document, filename } = payload;
    const serialized = JSON.stringify(document, null, 2);
    downloadTextAsFile(serialized, filename, 'application/json');

    if (onComplete) {
      const exportedFile = new File([serialized], filename, { type: 'application/json' });
      onComplete([exportedFile]);
    }
  }, [buildPayload, onComplete]);

  const handleGeneratePdf = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    const { document, filename } = payload;
    const serialized = JSON.stringify(document, null, 2);
    const jsonFile = new File([serialized], filename, { type: 'application/json' });

    const formData = new FormData();
    formData.append('fileInput', jsonFile);

    try {
      setIsGeneratingPdf(true);
      const response = await apiClient.post(CONVERSION_ENDPOINTS['json-pdf'], formData, {
        responseType: 'blob',
      });

      const contentDisposition = response.headers?.['content-disposition'] ?? '';
      const detectedName = getFilenameFromHeaders(contentDisposition);
      const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
      const downloadName = detectedName || `${baseName || 'document'}.pdf`;

      downloadBlob(response.data, downloadName);

      if (onComplete) {
        const pdfFile = new File([response.data], downloadName, { type: 'application/pdf' });
        onComplete([pdfFile]);
      }
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Failed to convert JSON back to PDF', error);
      const message =
        error?.response?.data ||
        error?.message ||
        t('pdfJsonEditor.errors.pdfConversion', 'Unable to convert the edited JSON back into a PDF.');
      const msgString = typeof message === 'string' ? message : String(message);
      setErrorMessage(msgString);
      if (onError) {
        onError(msgString);
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [buildPayload, onComplete, onError, t]);

  const viewData = useMemo<PdfJsonEditorViewData>(() => ({
    document: loadedDocument,
    groupsByPage,
    imagesByPage,
    selectedPage,
    dirtyPages,
    hasDocument,
    fileName,
    errorMessage,
    isGeneratingPdf,
    isConverting,
    hasChanges,
    onLoadJson: handleLoadFile,
    onSelectPage: handleSelectPage,
    onGroupEdit: handleGroupTextChange,
    onImageTransform: handleImageTransform,
    onImageReset: handleImageReset,
    onReset: handleResetEdits,
    onDownloadJson: handleDownloadJson,
    onGeneratePdf: handleGeneratePdf,
  }), [
    handleImageTransform,
    imagesByPage,
    dirtyPages,
    errorMessage,
    fileName,
    groupsByPage,
    handleDownloadJson,
    handleGeneratePdf,
    handleGroupTextChange,
    handleImageReset,
    handleLoadFile,
    handleResetEdits,
    handleSelectPage,
    hasChanges,
    hasDocument,
    isGeneratingPdf,
    isConverting,
    loadedDocument,
    selectedPage,
  ]);

  const latestViewDataRef = useRef<PdfJsonEditorViewData>(viewData);
  latestViewDataRef.current = viewData;

  useEffect(() => {
    if (selectedFiles.length === 0) {
      autoLoadKeyRef.current = null;
      return;
    }

    if (navigationState.selectedTool !== 'pdfJsonEditor') {
      return;
    }

    const file = selectedFiles[0];
    if (!file) {
      return;
    }

    const fileKey = getAutoLoadKey(file);
    if (autoLoadKeyRef.current === fileKey) {
      return;
    }

    autoLoadKeyRef.current = fileKey;
    void handleLoadFile(file);
  }, [selectedFiles, navigationState.selectedTool, handleLoadFile]);

  useEffect(() => {
    registerCustomWorkbenchView({
      id: VIEW_ID,
      workbenchId: WORKBENCH_ID,
      label: viewLabel,
      icon: <DescriptionIcon fontSize="small" />,
      component: PdfJsonEditorView,
    });
    setLeftPanelView('hidden');
    setCustomWorkbenchViewData(VIEW_ID, latestViewDataRef.current);

    return () => {
      clearCustomWorkbenchViewData(VIEW_ID);
      unregisterCustomWorkbenchView(VIEW_ID);
      setLeftPanelView('toolPicker');
    };
  }, [
    clearCustomWorkbenchViewData,
    registerCustomWorkbenchView,
    setCustomWorkbenchViewData,
    setLeftPanelView,
    viewLabel,
    unregisterCustomWorkbenchView,
  ]);

  useEffect(() => {
    if (
      navigationState.selectedTool === 'pdfJsonEditor' &&
      navigationState.workbench !== WORKBENCH_ID
    ) {
      navigationActions.setWorkbench(WORKBENCH_ID);
    }
  }, [navigationActions, navigationState.selectedTool, navigationState.workbench]);

  const lastSentViewDataRef = useRef<PdfJsonEditorViewData | null>(null);

  useEffect(() => {
    if (lastSentViewDataRef.current === viewData) {
      return;
    }
    lastSentViewDataRef.current = viewData;
    setCustomWorkbenchViewData(VIEW_ID, viewData);
  }, [setCustomWorkbenchViewData, viewData]);

  // All editing happens in the custom workbench view.
  return null;
};

(PdfJsonEditor as ToolComponent).tool = () => {
  throw new Error('PDF JSON Editor does not support automation operations.');
};

(PdfJsonEditor as ToolComponent).getDefaultParameters = () => ({
  groups: [],
});

export default PdfJsonEditor as ToolComponent;
