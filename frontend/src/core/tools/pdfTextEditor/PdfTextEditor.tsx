import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined';

import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileSelection, useFileManagement, useFileContext } from '@app/contexts/FileContext';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
import { BaseToolProps, ToolComponent } from '@app/types/tool';
import { getDefaultWorkbench } from '@app/types/workbench';
import { CONVERSION_ENDPOINTS } from '@app/constants/convertConstants';
import apiClient from '@app/services/apiClient';
import { downloadBlob, downloadTextAsFile } from '@app/utils/downloadUtils';
import { getFilenameFromHeaders } from '@app/utils/fileResponseUtils';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PdfJsonDocument,
  PdfJsonImageElement,
  PdfJsonPage,
  TextGroup,
  PdfTextEditorViewData,
  BoundingBox,
  ConversionProgress,
} from '@app/tools/pdfTextEditor/pdfTextEditorTypes';
import {
  deepCloneDocument,
  getDirtyPages,
  groupDocumentText,
  restoreGlyphElements,
  extractDocumentImages,
  cloneImageElement,
  cloneTextElement,
  valueOr,
} from '@app/tools/pdfTextEditor/pdfTextEditorUtils';
import PdfTextEditorView from '@app/components/tools/pdfTextEditor/PdfTextEditorView';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const WORKBENCH_VIEW_ID = 'pdfTextEditorWorkbench';
const WORKBENCH_ID = 'custom:pdfTextEditor' as const;

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

const normalizeLineArray = (value: string | undefined | null, expected: number): string[] => {
  const normalized = (value ?? '').replace(/\r/g, '');
  if (expected <= 0) {
    return [normalized];
  }
  const parts = normalized.split('\n');
  if (parts.length === expected) {
    return parts;
  }
  if (parts.length < expected) {
    return parts.concat(Array(expected - parts.length).fill(''));
  }
  const head = parts.slice(0, Math.max(expected - 1, 0));
  const tail = parts.slice(Math.max(expected - 1, 0)).join('\n');
  return [...head, tail];
};

const cloneLineTemplate = (line: TextGroup, text?: string, originalText?: string): TextGroup => ({
  ...line,
  text: text ?? line.text,
  originalText: originalText ?? line.originalText,
  childLineGroups: null,
  lineElementCounts: null,
  lineSpacing: null,
  elements: line.elements.map(cloneTextElement),
  originalElements: line.originalElements.map(cloneTextElement),
});

const expandGroupToLines = (group: TextGroup): TextGroup[] => {
  if (group.childLineGroups && group.childLineGroups.length > 0) {
    const textLines = normalizeLineArray(group.text, group.childLineGroups.length);
    const originalLines = normalizeLineArray(group.originalText, group.childLineGroups.length);
    return group.childLineGroups.map((child, index) =>
      cloneLineTemplate(child, textLines[index], originalLines[index]),
    );
  }
  return [cloneLineTemplate(group)];
};

const mergeBoundingBoxes = (boxes: BoundingBox[]): BoundingBox => {
  if (boxes.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  return boxes.reduce(
    (acc, box) => ({
      left: Math.min(acc.left, box.left),
      right: Math.max(acc.right, box.right),
      top: Math.min(acc.top, box.top),
      bottom: Math.max(acc.bottom, box.bottom),
    }),
    { ...boxes[0] },
  );
};

const buildMergedGroupFromSelection = (groups: TextGroup[]): TextGroup | null => {
  if (groups.length === 0) {
    return null;
  }

  const lineTemplates = groups.flatMap(expandGroupToLines);
  if (lineTemplates.length <= 1) {
    return null;
  }

  const lineTexts = lineTemplates.map((line) => line.text ?? '');
  const lineOriginalTexts = lineTemplates.map((line) => line.originalText ?? '');
  const combinedOriginals = lineTemplates.flatMap((line) => line.originalElements.map(cloneTextElement));
  const combinedElements = combinedOriginals.map(cloneTextElement);
  const mergedBounds = mergeBoundingBoxes(lineTemplates.map((line) => line.bounds));

  const spacingValues: number[] = [];
  for (let index = 1; index < lineTemplates.length; index += 1) {
    const prevBaseline = lineTemplates[index - 1].baseline ?? lineTemplates[index - 1].bounds.bottom;
    const currentBaseline = lineTemplates[index].baseline ?? lineTemplates[index].bounds.bottom;
    const spacing = Math.abs(prevBaseline - currentBaseline);
    if (spacing > 0) {
      spacingValues.push(spacing);
    }
  }
  const averageSpacing =
    spacingValues.length > 0
      ? spacingValues.reduce((sum, value) => sum + value, 0) / spacingValues.length
      : null;

  const first = groups[0];
  const lineElementCounts = lineTemplates.map((line) => Math.max(line.originalElements.length, 1));
  const paragraph: TextGroup = {
    ...first,
    text: lineTexts.join('\n'),
    originalText: lineOriginalTexts.join('\n'),
    elements: combinedElements,
    originalElements: combinedOriginals,
    bounds: mergedBounds,
    lineSpacing: averageSpacing,
    lineElementCounts: lineElementCounts.length > 1 ? lineElementCounts : null,
    childLineGroups: lineTemplates.map((line, index) =>
      cloneLineTemplate(line, lineTexts[index], lineOriginalTexts[index]),
    ),
  };

  return paragraph;
};

const splitParagraphGroup = (group: TextGroup): TextGroup[] => {
  if (!group.childLineGroups || group.childLineGroups.length <= 1) {
    return [];
  }

  const templateLines = group.childLineGroups.map((child) => cloneLineTemplate(child));
  const lineCount = templateLines.length;
  const textLines = normalizeLineArray(group.text, lineCount);
  const originalLines = normalizeLineArray(group.originalText, lineCount);
  const baseCounts =
    group.lineElementCounts && group.lineElementCounts.length === lineCount
      ? [...group.lineElementCounts]
      : templateLines.map((line) => Math.max(line.originalElements.length, 1));

  const totalOriginals = group.originalElements.length;
  const counted = baseCounts.reduce((sum, count) => sum + count, 0);
  if (counted < totalOriginals && baseCounts.length > 0) {
    baseCounts[baseCounts.length - 1] += totalOriginals - counted;
  }

  let offset = 0;
  return templateLines.map((template, index) => {
    const take = Math.max(1, baseCounts[index] ?? 1);
    const slice = group.originalElements.slice(offset, offset + take).map(cloneTextElement);
    offset += take;
    return {
      ...template,
      id: `${group.id}-line-${index + 1}-${Date.now()}-${index}`,
      text: textLines[index] ?? '',
      originalText: originalLines[index] ?? '',
      elements: slice.map(cloneTextElement),
      originalElements: slice,
      lineElementCounts: null,
      lineSpacing: null,
      childLineGroups: null,
    };
  });
};

const PdfTextEditor = ({ onComplete, onError }: BaseToolProps) => {
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
  const { addFiles } = useFileManagement();
  const { consumeFiles, selectors } = useFileContext();

  const [loadedDocument, setLoadedDocument] = useState<PdfJsonDocument | null>(null);
  const [groupsByPage, setGroupsByPage] = useState<TextGroup[][]>([]);
  const [imagesByPage, setImagesByPage] = useState<PdfJsonImageElement[][]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [fileName, setFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingToWorkbench, setIsSavingToWorkbench] = useState(false);
  const [shouldNavigateAfterSave, setShouldNavigateAfterSave] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress | null>(null);
  const [forceSingleTextElement, setForceSingleTextElement] = useState(true);
  const [groupingMode, setGroupingMode] = useState<'auto' | 'paragraph' | 'singleLine'>('auto');
  const [hasVectorPreview, setHasVectorPreview] = useState(false);
  const [pagePreviews, setPagePreviews] = useState<Map<number, string>>(new Map());

  // Lazy loading state
  const [isLazyMode, setIsLazyMode] = useState(false);
  const [cachedJobId, setCachedJobId] = useState<string | null>(null);
  const [loadedImagePages, setLoadedImagePages] = useState<Set<number>>(new Set());
  const [loadingImagePages, setLoadingImagePages] = useState<Set<number>>(new Set());

  const originalImagesRef = useRef<PdfJsonImageElement[][]>([]);
  const originalGroupsRef = useRef<TextGroup[][]>([]);
  const imagesByPageRef = useRef<PdfJsonImageElement[][]>([]);
  const lastLoadedFileRef = useRef<File | null>(null);
  const autoLoadKeyRef = useRef<string | null>(null);
  const sourceFileIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const latestPdfRequestIdRef = useRef<number | null>(null);
  const loadedDocumentRef = useRef<PdfJsonDocument | null>(null);
  const loadedImagePagesRef = useRef<Set<number>>(new Set());
  const loadingImagePagesRef = useRef<Set<number>>(new Set());
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const previewRequestIdRef = useRef(0);
  const previewRenderingRef = useRef<Set<number>>(new Set());
  const pagePreviewsRef = useRef<Map<number, string>>(pagePreviews);
  const previewScaleRef = useRef<Map<number, number>>(new Map());
  const cachedJobIdRef = useRef<string | null>(null);
  const previousCachedJobIdRef = useRef<string | null>(null);
  const cacheRecoveryInProgressRef = useRef(false);
  const cacheRecoveryAttemptsRef = useRef(0);
  const recoverCacheAndReloadRef = useRef<() => Promise<boolean>>(async () => false);

  // Keep ref in sync with state for access in async callbacks
  useEffect(() => {
    loadedDocumentRef.current = loadedDocument;
  }, [loadedDocument]);

  useEffect(() => {
    loadedImagePagesRef.current = new Set(loadedImagePages);
  }, [loadedImagePages]);

  useEffect(() => {
    loadingImagePagesRef.current = new Set(loadingImagePages);
  }, [loadingImagePages]);

  useEffect(() => {
    pagePreviewsRef.current = pagePreviews;
  }, [pagePreviews]);


  useEffect(() => {
    return () => {
      if (pdfDocumentRef.current) {
        pdfWorkerManager.destroyDocument(pdfDocumentRef.current);
        pdfDocumentRef.current = null;
      }
    };
  }, []);

  const isCacheUnavailableError = useCallback((error: any): boolean => {
    const status = error?.response?.status;
    // Treat any 410 as cache unavailable, since responseType: 'blob' makes
    // it impossible to reliably check the JSON body
    return status === 410;
  }, []);

  const dirtyPages = useMemo(
    () => getDirtyPages(groupsByPage, imagesByPage, originalGroupsRef.current, originalImagesRef.current),
    [groupsByPage, imagesByPage],
  );
  const hasChanges = useMemo(() => dirtyPages.some(Boolean), [dirtyPages]);
  const hasDocument = loadedDocument !== null;

  // Sync hasChanges to navigation context so navigation guards can block
  useEffect(() => {
    navigationActions.setHasUnsavedChanges(hasChanges);
    return () => {
      navigationActions.setHasUnsavedChanges(false);
    };
  }, [hasChanges, navigationActions]);

  // Navigate to files view AFTER the unsaved changes state is properly cleared
  useEffect(() => {
    if (shouldNavigateAfterSave && !navigationState.hasUnsavedChanges) {
      setShouldNavigateAfterSave(false);
      navigationActions.setToolAndWorkbench(null, getDefaultWorkbench());
    }
  }, [shouldNavigateAfterSave, navigationState.hasUnsavedChanges, navigationActions]);

  const viewLabel = useMemo(() => t('pdfTextEditor.viewLabel', 'PDF Editor'), [t]);
  const { selectedFiles } = useFileSelection();

  const resetToDocument = useCallback((document: PdfJsonDocument | null, mode: 'auto' | 'paragraph' | 'singleLine') => {
    if (!document) {
      setGroupsByPage([]);
      setImagesByPage([]);
      originalImagesRef.current = [];
      imagesByPageRef.current = [];
      setLoadedImagePages(new Set());
      setLoadingImagePages(new Set());
      loadedImagePagesRef.current = new Set();
      loadingImagePagesRef.current = new Set();
      setSelectedPage(0);
      setIsLazyMode(false);
      setCachedJobId(null);
      cachedJobIdRef.current = null;
      return;
    }
    const cloned = deepCloneDocument(document);
    const groups = groupDocumentText(cloned, mode);
    const images = extractDocumentImages(cloned);
    const originalImages = images.map((page) => page.map(cloneImageElement));
    originalImagesRef.current = originalImages;
    originalGroupsRef.current = groups.map((page) => page.map((group) => ({ ...group })));
    imagesByPageRef.current = images.map((page) => page.map(cloneImageElement));
    const initialLoaded = new Set<number>();
    originalImages.forEach((pageImages, index) => {
      if (pageImages.length > 0) {
        initialLoaded.add(index);
      }
    });
    setGroupsByPage(groups);
    setImagesByPage(images);
    setLoadedImagePages(initialLoaded);
    setLoadingImagePages(new Set());
    loadedImagePagesRef.current = new Set(initialLoaded);
    loadingImagePagesRef.current = new Set();
    setSelectedPage(0);
  }, []);

  const clearPdfPreview = useCallback(() => {
    previewRequestIdRef.current += 1;
    previewRenderingRef.current.clear();
    previewScaleRef.current.clear();
    const empty = new Map<number, string>();
    pagePreviewsRef.current = empty;
    setPagePreviews(empty);
    if (pdfDocumentRef.current) {
      pdfWorkerManager.destroyDocument(pdfDocumentRef.current);
      pdfDocumentRef.current = null;
    }
    setHasVectorPreview(false);
  }, []);

  const clearCachedJob = useCallback((jobId: string | null) => {
    if (!jobId) {
      return;
    }
    console.log(`[PdfTextEditor] Cleaning up cached document for jobId: ${jobId}`);
    apiClient.post(`/api/v1/convert/pdf/text-editor/clear-cache/${jobId}`).catch((error) => {
      console.warn('[PdfTextEditor] Failed to clear cache:', error);
    });
  }, []);

  useEffect(() => {
    // Clear old cached job when job ID changes
    const previousJobId = previousCachedJobIdRef.current;
    if (previousJobId && previousJobId !== cachedJobId) {
      console.log(`[PdfTextEditor] Clearing old cache for jobId: ${previousJobId}, new jobId: ${cachedJobId}`);
      clearCachedJob(previousJobId);
    }
    // Update the previous jobId ref for next time
    previousCachedJobIdRef.current = cachedJobId;
  }, [cachedJobId, clearCachedJob]);

  const initializePdfPreview = useCallback(
    async (file: File) => {
      const requestId = ++previewRequestIdRef.current;
      try {
        const buffer = await file.arrayBuffer();
        const pdfDocument = await pdfWorkerManager.createDocument(buffer);
        if (previewRequestIdRef.current !== requestId) {
          pdfWorkerManager.destroyDocument(pdfDocument);
          return;
        }
        if (pdfDocumentRef.current) {
          pdfWorkerManager.destroyDocument(pdfDocumentRef.current);
        }
        pdfDocumentRef.current = pdfDocument;
        previewRenderingRef.current.clear();
        previewScaleRef.current.clear();
        const empty = new Map<number, string>();
        pagePreviewsRef.current = empty;
        setPagePreviews(empty);
        setHasVectorPreview(true);
      } catch (error) {
        if (previewRequestIdRef.current === requestId) {
          console.warn('[PdfTextEditor] Failed to initialise PDF preview:', error);
          clearPdfPreview();
        }
      }
    },
    [clearPdfPreview],
  );

  // Load images for a page in lazy mode
  const loadImagesForPage = useCallback(
    async (pageIndex: number) => {
      if (!isLazyMode) {
        return;
      }
      if (!cachedJobId) {
        console.log('[loadImagesForPage] No cached jobId, skipping');
        return;
      }
      if (
        loadedImagePagesRef.current.has(pageIndex) ||
        loadingImagePagesRef.current.has(pageIndex)
      ) {
        return;
      }

      loadingImagePagesRef.current.add(pageIndex);
      setLoadingImagePages((prev) => {
        const next = new Set(prev);
        next.add(pageIndex);
        return next;
      });

      const pageNumber = pageIndex + 1;
      const start = performance.now();

      try {
        const response = await apiClient.get(
          `/api/v1/convert/pdf/text-editor/page/${cachedJobId}/${pageNumber}`,
          {
            responseType: 'json',
          },
        );

        const pageData = response.data as PdfJsonPage;
        const normalizedImages = (pageData.imageElements ?? []).map(cloneImageElement);

        if (imagesByPageRef.current.length <= pageIndex) {
          imagesByPageRef.current.length = pageIndex + 1;
        }
        imagesByPageRef.current[pageIndex] = normalizedImages.map(cloneImageElement);

        setLoadedDocument((prevDoc) => {
          if (!prevDoc || !prevDoc.pages) {
            return prevDoc;
          }
          const nextPages = [...prevDoc.pages];
          const existingPage = nextPages[pageIndex] ?? {};
          nextPages[pageIndex] = {
            ...existingPage,
            imageElements: normalizedImages.map(cloneImageElement),
          };
          return {
            ...prevDoc,
            pages: nextPages,
          };
        });

        setImagesByPage((prev) => {
          const next = [...prev];
          while (next.length <= pageIndex) {
            next.push([]);
          }
          next[pageIndex] = normalizedImages.map(cloneImageElement);
          return next;
        });

        if (originalImagesRef.current.length <= pageIndex) {
          originalImagesRef.current.length = pageIndex + 1;
        }
        originalImagesRef.current[pageIndex] = normalizedImages.map(cloneImageElement);

        setLoadedImagePages((prev) => {
          const next = new Set(prev);
          next.add(pageIndex);
          return next;
        });
        loadedImagePagesRef.current.add(pageIndex);

        console.log(
          `[loadImagesForPage] Loaded ${normalizedImages.length} images for page ${pageNumber} in ${(
            performance.now() - start
          ).toFixed(2)}ms`,
        );
      } catch (error) {
        console.error(`[loadImagesForPage] Failed to load images for page ${pageNumber}:`, error);
        if (isCacheUnavailableError(error)) {
          console.log('[loadImagesForPage] Cache expired, triggering automatic recovery...');
          // Automatically recover by reloading the file
          void recoverCacheAndReloadRef.current();
        }
      } finally {
        loadingImagePagesRef.current.delete(pageIndex);
        setLoadingImagePages((prev) => {
          const next = new Set(prev);
          next.delete(pageIndex);
          return next;
        });
      }
    },
    [isLazyMode, cachedJobId, isCacheUnavailableError],
  );

  const handleLoadFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }

      lastLoadedFileRef.current = file;
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      const _fileKey = getAutoLoadKey(file);
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      try {
        let parsed: PdfJsonDocument | null = null;
        let shouldUseLazyMode = false;
        let pendingJobId: string | null = null;

        if (isPdf) {
          latestPdfRequestIdRef.current = requestId;
          setIsConverting(true);
          setConversionProgress({
            percent: 0,
            stage: 'uploading',
            message: 'Uploading PDF file to server...',
          });

          const formData = new FormData();
          formData.append('fileInput', file);

          console.log('Sending conversion request with async=true');
          const response = await apiClient.post(
            `${CONVERSION_ENDPOINTS['pdf-text-editor']}?async=true&lightweight=true`,
            formData,
            {
              responseType: 'json',
            },
          );

          console.log('Conversion response:', response.data);
          const jobId = response.data.jobId;

          if (!jobId) {
            console.error('No job ID in response:', response.data);
            throw new Error('No job ID received from server');
          }

          pendingJobId = jobId;
          console.log('Got job ID:', jobId);
          setConversionProgress({
            percent: 3,
            stage: 'processing',
            message: 'Starting conversion...',
          });

        let jobComplete = false;
        let attempts = 0;
        const maxAttempts = 600;
        let pollDelay = 500;

        while (!jobComplete && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollDelay));
          attempts += 1;
          if (pollDelay < 10000) {
            pollDelay = Math.min(10000, Math.floor(pollDelay * 1.5));
          }

            try {
              const statusResponse = await apiClient.get(`/api/v1/general/job/${jobId}`);
              const jobStatus = statusResponse.data;
              console.log(`Job status (attempt ${attempts}):`, jobStatus);

              const percent = Math.min(Math.max(jobStatus.progress ?? 0, 0), 100);
              const stage = jobStatus.stage || 'processing';
              const message = jobStatus.note || 'Converting PDF to JSON...';
              const current = jobStatus.current ?? undefined;
              const total = jobStatus.total ?? undefined;
              setConversionProgress({
                percent,
                stage,
                message,
                current,
                total,
              });

              if (jobStatus.complete) {
                if (jobStatus.error) {
                  console.error('Job failed:', jobStatus.error);
                  throw new Error(jobStatus.error);
                }

                console.log('Job completed, retrieving JSON result...');
                jobComplete = true;

                const resultResponse = await apiClient.get(
                  `/api/v1/general/job/${jobId}/result`,
                  {
                    responseType: 'blob',
                  },
                );

                const jsonText = await resultResponse.data.text();
                const result = JSON.parse(jsonText);

                if (!Array.isArray(result.pages)) {
                  console.error('Conversion result missing page array:', result);
                  throw new Error(
                    'PDF conversion result did not include page data. Please update the server.',
                  );
                }

                const docResult = result as PdfJsonDocument;
                parsed = {
                  ...docResult,
                  pages: docResult.pages ?? [],
                };
                shouldUseLazyMode = Boolean(docResult.lazyImages);
                pendingJobId = shouldUseLazyMode ? jobId : null;
                setConversionProgress(null);
              } else {
                console.log('Job not complete yet, continuing to poll...');
              }
            } catch (pollError: any) {
              console.error('Error polling job status:', pollError);
              console.error('Poll error details:', {
                status: pollError?.response?.status,
                data: pollError?.response?.data,
                message: pollError?.message,
              });
              if (pollError?.response?.status === 404) {
                throw new Error('Job not found on server');
              }
            }
          }

          if (!jobComplete) {
            throw new Error('Conversion timed out');
          }
          if (!parsed) {
            throw new Error('Conversion did not return JSON content');
          }
        } else {
          const content = await file.text();
          const docResult = JSON.parse(content) as PdfJsonDocument;
          parsed = {
            ...docResult,
            pages: docResult.pages ?? [],
          };
          shouldUseLazyMode = false;
          pendingJobId = null;
        }

        setConversionProgress(null);

        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        if (!parsed) {
          throw new Error('Failed to parse PDF JSON document');
        }

        console.log(
          `[PdfTextEditor] Document loaded. Lazy image mode: ${shouldUseLazyMode}, Pages: ${
            parsed.pages?.length || 0
          }`,
        );

        if (isPdf) {
          initializePdfPreview(file);
        } else {
          clearPdfPreview();
        }

        setLoadedDocument(parsed);
        resetToDocument(parsed, groupingMode);
        setIsLazyMode(shouldUseLazyMode);
        const newJobId = shouldUseLazyMode ? pendingJobId : null;
        setCachedJobId(newJobId);
        cachedJobIdRef.current = newJobId;
        setFileName(file.name);
        setErrorMessage(null);
      } catch (error: any) {
        console.error('Failed to load file', error);
        console.error('Error details:', {
          message: error?.message,
          response: error?.response?.data,
          stack: error?.stack,
        });

        if (loadRequestIdRef.current !== requestId) {
          return;
        }

        setLoadedDocument(null);
        resetToDocument(null, groupingMode);
        clearPdfPreview();
        setIsLazyMode(false);
        setCachedJobId(null);
        cachedJobIdRef.current = null;

        if (isPdf) {
          const errorMsg =
            error?.message ||
            t('pdfTextEditor.conversionFailed', 'Failed to convert PDF. Please try again.');
          setErrorMessage(errorMsg);
          console.error('Setting error message:', errorMsg);
        } else {
          setErrorMessage(
            t(
              'pdfTextEditor.errors.invalidJson',
              'Unable to read the JSON file. Ensure it was generated by the PDF to JSON tool.',
            ),
          );
        }
      } finally {
        if (isPdf && latestPdfRequestIdRef.current === requestId) {
          setIsConverting(false);
        }
      }
    },
    [groupingMode, resetToDocument, t],
  );

  const recoverCacheAndReload = useCallback(async () => {
    if (cacheRecoveryInProgressRef.current) {
      return false;
    }
    if (cacheRecoveryAttemptsRef.current >= 2) {
      console.warn('[PdfTextEditor] Cache recovery limit reached');
      return false;
    }
    cacheRecoveryAttemptsRef.current += 1;
    const file = lastLoadedFileRef.current;
    if (!file) {
      console.warn('[PdfTextEditor] No file available for cache recovery');
      return false;
    }
    cacheRecoveryInProgressRef.current = true;
    try {
      console.log('[PdfTextEditor] Automatically reloading file due to cache expiration...');
      await handleLoadFile(file);
      console.log('[PdfTextEditor] Cache recovery successful');
      return true;
    } catch (error) {
      console.error('[PdfTextEditor] Cache recovery failed', error);
      return false;
    } finally {
      cacheRecoveryInProgressRef.current = false;
    }
  }, [handleLoadFile]);

  useEffect(() => {
    recoverCacheAndReloadRef.current = recoverCacheAndReload;
  }, [recoverCacheAndReload]);

  // Wrapper for loading files from the dropzone - adds to workbench first
  const handleLoadFileFromDropzone = useCallback(
    async (file: File) => {
      // Add the file to the workbench so it appears in the file list
      const addedFiles = await addFiles([file]);
      // Capture the file ID for save-to-workbench functionality
      if (addedFiles.length > 0 && addedFiles[0].fileId) {
        sourceFileIdRef.current = addedFiles[0].fileId;
      }
      // Then load it into the editor
      void handleLoadFile(file);
    },
    [addFiles, handleLoadFile],
  );

  const handleSelectPage = useCallback((pageIndex: number) => {
    setSelectedPage(pageIndex);
    // Trigger lazy loading for images on the selected page
    if (isLazyMode) {
      void loadImagesForPage(pageIndex);
    }
  }, [isLazyMode, loadImagesForPage]);

  const handleGroupTextChange = useCallback((pageIndex: number, groupId: string, value: string) => {
    setGroupsByPage((previous) =>
      previous.map((groups, idx) =>
        idx !== pageIndex
          ? groups
          : groups.map((group) => (group.id === groupId ? { ...group, text: value } : group))
      )
    );
  }, []);

  const handleGroupDelete = useCallback((pageIndex: number, groupId: string) => {
    console.log(`🗑️ Deleting group ${groupId} from page ${pageIndex}`);
    setGroupsByPage((previous) => {
      const updated = previous.map((groups, idx) => {
        if (idx !== pageIndex) return groups;
        const filtered = groups.filter((group) => group.id !== groupId);
        console.log(`   Before: ${groups.length} groups, After: ${filtered.length} groups`);
        return filtered;
      });
      return updated;
    });
  }, []);

  const handleMergeGroups = useCallback((pageIndex: number, groupIds: string[]): boolean => {
    if (groupIds.length < 2) {
      return false;
    }
    let updated = false;
    setGroupsByPage((previous) =>
      previous.map((groups, idx) => {
        if (idx !== pageIndex) {
          return groups;
        }
        const indices = groupIds
          .map((id) => groups.findIndex((group) => group.id === id))
          .filter((index) => index >= 0);
        if (indices.length !== groupIds.length) {
          return groups;
        }
        const sorted = [...indices].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i += 1) {
          if (sorted[i] !== sorted[i - 1] + 1) {
            return groups;
          }
        }
        const selection = sorted.map((position) => groups[position]);
        const merged = buildMergedGroupFromSelection(selection);
        if (!merged) {
          return groups;
        }
        const next = [
          ...groups.slice(0, sorted[0]),
          merged,
          ...groups.slice(sorted[sorted.length - 1] + 1),
        ];
        updated = true;
        return next;
      }),
    );
    return updated;
  }, []);

  const handleUngroupGroup = useCallback((pageIndex: number, groupId: string): boolean => {
    let updated = false;
    setGroupsByPage((previous) =>
      previous.map((groups, idx) => {
        if (idx !== pageIndex) {
          return groups;
        }
        const targetIndex = groups.findIndex((group) => group.id === groupId);
        if (targetIndex < 0) {
          return groups;
        }
        const targetGroup = groups[targetIndex];
        const splits = splitParagraphGroup(targetGroup);
        if (splits.length <= 1) {
          return groups;
        }
        const next = [
          ...groups.slice(0, targetIndex),
          ...splits,
          ...groups.slice(targetIndex + 1),
        ];
        updated = true;
        return next;
      }),
    );
    return updated;
  }, []);

  const handleImageTransform = useCallback(
    (
      pageIndex: number,
      imageId: string,
      next: { left: number; bottom: number; width: number; height: number; transform: number[] },
    ) => {
      setImagesByPage((previous) => {
        const current = previous[pageIndex] ?? [];
        let changed = false;
        const updatedPage = current.map((image) => {
          if ((image.id ?? '') !== imageId) {
            return image;
          }
          const originalTransform = image.transform ?? originalImagesRef.current[pageIndex]?.find((base) => (base.id ?? '') === imageId)?.transform;
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
            transform: scaleXSign < 0 || scaleYSign < 0
              ? [
                  next.width * scaleXSign,
                  0,
                  0,
                  next.height * scaleYSign,
                  next.left,
                  scaleYSign >= 0 ? next.bottom : next.bottom + next.height,
                ]
              : null,
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

        if (!changed) {
          return previous;
        }

        const nextImages = previous.map((images, idx) => (idx === pageIndex ? updatedPage : images));
        if (imagesByPageRef.current.length <= pageIndex) {
          imagesByPageRef.current.length = pageIndex + 1;
        }
        imagesByPageRef.current[pageIndex] = updatedPage.map(cloneImageElement);
        return nextImages;
      });
    },
    [],
  );

  const handleImageReset = useCallback((pageIndex: number, imageId: string) => {
    const baseline = originalImagesRef.current[pageIndex]?.find((image) => (image.id ?? '') === imageId);
    if (!baseline) {
      return;
    }
    setImagesByPage((previous) => {
      const current = previous[pageIndex] ?? [];
      let changed = false;
      const updatedPage = current.map((image) => {
        if ((image.id ?? '') !== imageId) {
          return image;
        }
        changed = true;
        return cloneImageElement(baseline);
      });

      if (!changed) {
        return previous;
      }

      const nextImages = previous.map((images, idx) => (idx === pageIndex ? updatedPage : images));
      if (imagesByPageRef.current.length <= pageIndex) {
        imagesByPageRef.current.length = pageIndex + 1;
      }
      imagesByPageRef.current[pageIndex] = updatedPage.map(cloneImageElement);
      return nextImages;
    });
  }, []);

  const handleResetEdits = useCallback(() => {
    if (!loadedDocument) {
      return;
    }
    resetToDocument(loadedDocument, groupingMode);
    setErrorMessage(null);
  }, [groupingMode, loadedDocument, resetToDocument]);

  const buildPayload = useCallback(() => {
    if (!loadedDocument) {
      return null;
    }

    const updatedDocument = restoreGlyphElements(
      loadedDocument,
      groupsByPage,
      imagesByPageRef.current,
      originalImagesRef.current,
      forceSingleTextElement,
    );
    const baseName = sanitizeBaseName(fileName || loadedDocument.metadata?.title || undefined);
    return {
      document: updatedDocument,
      filename: `${baseName}.json`,
    };
  }, [fileName, forceSingleTextElement, groupsByPage, loadedDocument]);

  const handleDownloadJson = useCallback(() => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    const { document, filename } = payload;
    const serialized = JSON.stringify(document);
    downloadTextAsFile(serialized, filename, 'application/json');

    if (onComplete) {
      const exportedFile = new File([serialized], filename, { type: 'application/json' });
      onComplete([exportedFile]);
    }
  }, [buildPayload, onComplete]);

  const handleGeneratePdf = useCallback(async (skipComplete = false) => {
    try {
      setIsGeneratingPdf(true);

      const ensureImagesForPages = async (pageIndices: number[]) => {
        const uniqueIndices = Array.from(new Set(pageIndices)).filter((index) => index >= 0);
        if (uniqueIndices.length === 0) {
          return;
        }

        for (const index of uniqueIndices) {
          if (!loadedImagePagesRef.current.has(index)) {
            await loadImagesForPage(index);
          }
        }

        const maxWaitTime = 15000;
        const pollInterval = 150;
        const startWait = Date.now();
        while (Date.now() - startWait < maxWaitTime) {
          const allLoaded = uniqueIndices.every(
            (index) =>
              loadedImagePagesRef.current.has(index) &&
              imagesByPageRef.current[index] !== undefined,
          );
          const anyLoading = uniqueIndices.some((index) =>
            loadingImagePagesRef.current.has(index),
          );
          if (allLoaded && !anyLoading) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        const missing = uniqueIndices.filter(
          (index) => !loadedImagePagesRef.current.has(index),
        );
        if (missing.length > 0) {
          throw new Error(
            `Failed to load images for pages ${missing.map((i) => i + 1).join(', ')}`,
          );
        }
      };

      const currentDoc = loadedDocumentRef.current;
      const totalPages = currentDoc?.pages?.length ?? 0;
      const dirtyPageIndices = dirtyPages
        .map((isDirty, index) => (isDirty ? index : -1))
        .filter((index) => index >= 0);

      const canUseIncremental =
        isLazyMode &&
        cachedJobId &&
        dirtyPageIndices.length > 0 &&
        dirtyPageIndices.length < totalPages;

      if (canUseIncremental) {
        await ensureImagesForPages(dirtyPageIndices);

        try {
          const payload = buildPayload();
          if (!payload) {
            throw new Error('Failed to build payload');
          }

          const { document, filename } = payload;
          const dirtyPageSet = new Set(dirtyPageIndices);
          const partialPages =
            document.pages?.filter((_, index) => dirtyPageSet.has(index)) ?? [];

          const partialDocument: PdfJsonDocument = {
            metadata: document.metadata,
            xmpMetadata: document.xmpMetadata,
            fonts: document.fonts,
            lazyImages: true,
            pages: partialPages,
          };

          const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
          const expectedName = `${baseName || 'document'}.pdf`;
          const response = await apiClient.post(
            `/api/v1/convert/pdf/text-editor/partial/${cachedJobIdRef.current}?filename=${encodeURIComponent(expectedName)}`,
            partialDocument,
            {
              responseType: 'blob',
            },
          );

          const contentDisposition = response.headers?.['content-disposition'] ?? '';
          const detectedName = getFilenameFromHeaders(contentDisposition);
          const downloadName = detectedName || expectedName;

          downloadBlob(response.data, downloadName);

          if (onComplete && !skipComplete) {
            const pdfFile = new File([response.data], downloadName, { type: 'application/pdf' });
            onComplete([pdfFile]);
          }
          setErrorMessage(null);
          return;
        } catch (incrementalError) {
          console.warn(
            '[handleGeneratePdf] Incremental export failed, falling back to full export',
            incrementalError,
          );
          // Fall through to full export below
        }
      }

      if (isLazyMode && totalPages > 0) {
        const allPageIndices = Array.from({ length: totalPages }, (_, index) => index);
        await ensureImagesForPages(allPageIndices);
      }

      const payload = buildPayload();
      if (!payload) {
        return;
      }

      const { document, filename } = payload;
      const serialized = JSON.stringify(document);
      const jsonFile = new File([serialized], filename, { type: 'application/json' });

      const formData = new FormData();
      formData.append('fileInput', jsonFile);
      const response = await apiClient.post(CONVERSION_ENDPOINTS['text-editor-pdf'], formData, {
        responseType: 'blob',
      });

      const contentDisposition = response.headers?.['content-disposition'] ?? '';
      const detectedName = getFilenameFromHeaders(contentDisposition);
      const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
      const downloadName = detectedName || `${baseName || 'document'}.pdf`;

      downloadBlob(response.data, downloadName);

      if (onComplete && !skipComplete) {
        const pdfFile = new File([response.data], downloadName, { type: 'application/pdf' });
        onComplete([pdfFile]);
      }
      setErrorMessage(null);
    } catch (error: any) {
      console.error('Failed to convert JSON back to PDF', error);
      const message =
        error?.response?.data ||
        error?.message ||
        t('pdfTextEditor.errors.pdfConversion', 'Unable to convert the edited JSON back into a PDF.');
      const msgString = typeof message === 'string' ? message : String(message);
      setErrorMessage(msgString);
      if (onError) {
        onError(msgString);
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    buildPayload,
    cachedJobId,
    dirtyPages,
    isLazyMode,
    loadImagesForPage,
    onComplete,
    onError,
    t,
  ]);

  // Save changes to workbench (replaces the original file with edited version)
  const handleSaveToWorkbench = useCallback(async () => {
    setIsSavingToWorkbench(true);
    
    try {
      if (!sourceFileIdRef.current) {
        console.warn('[PdfTextEditor] No source file ID available for save to workbench');
        // Fall back to generating PDF download if no source file
        await handleGeneratePdf(true);
        return;
      }

      const parentStub = selectors.getStirlingFileStub(sourceFileIdRef.current as any);
      if (!parentStub) {
        console.warn('[PdfTextEditor] Could not find parent stub for save to workbench');
        await handleGeneratePdf(true);
        return;
      }

      const ensureImagesForPages = async (pageIndices: number[]) => {
        const uniqueIndices = Array.from(new Set(pageIndices)).filter((index) => index >= 0);
        if (uniqueIndices.length === 0) {
          return;
        }

        for (const index of uniqueIndices) {
          if (!loadedImagePagesRef.current.has(index)) {
            await loadImagesForPage(index);
          }
        }

        const maxWaitTime = 15000;
        const pollInterval = 150;
        const startWait = Date.now();
        while (Date.now() - startWait < maxWaitTime) {
          const allLoaded = uniqueIndices.every(
            (index) =>
              loadedImagePagesRef.current.has(index) &&
              imagesByPageRef.current[index] !== undefined,
          );
          const anyLoading = uniqueIndices.some((index) =>
            loadingImagePagesRef.current.has(index),
          );
          if (allLoaded && !anyLoading) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        const missing = uniqueIndices.filter(
          (index) => !loadedImagePagesRef.current.has(index),
        );
        if (missing.length > 0) {
          throw new Error(
            `Failed to load images for pages ${missing.map((i) => i + 1).join(', ')}`,
          );
        }
      };

      const currentDoc = loadedDocumentRef.current;
      const totalPages = currentDoc?.pages?.length ?? 0;
      const currentDirtyPages = getDirtyPages(groupsByPage, imagesByPage, originalGroupsRef.current, originalImagesRef.current);
      const dirtyPageIndices = currentDirtyPages
        .map((isDirty, index) => (isDirty ? index : -1))
        .filter((index) => index >= 0);

      let pdfBlob: Blob;
      let downloadName: string;

      const canUseIncremental =
        isLazyMode &&
        cachedJobId &&
        dirtyPageIndices.length > 0 &&
        dirtyPageIndices.length < totalPages;

      if (canUseIncremental) {
        await ensureImagesForPages(dirtyPageIndices);

        try {
          const payload = buildPayload();
          if (!payload) {
            throw new Error('Failed to build payload');
          }

          const { document, filename } = payload;
          const dirtyPageSet = new Set(dirtyPageIndices);
          const partialPages =
            document.pages?.filter((_, index) => dirtyPageSet.has(index)) ?? [];

          const partialDocument: PdfJsonDocument = {
            metadata: document.metadata,
            xmpMetadata: document.xmpMetadata,
            fonts: document.fonts,
            lazyImages: true,
            pages: partialPages,
          };

          const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
          const expectedName = `${baseName || 'document'}.pdf`;
          const response = await apiClient.post(
            `/api/v1/convert/pdf/text-editor/partial/${cachedJobId}?filename=${encodeURIComponent(expectedName)}`,
            partialDocument,
            {
              responseType: 'blob',
            },
          );

          const contentDisposition = response.headers?.['content-disposition'] ?? '';
          const detectedName = getFilenameFromHeaders(contentDisposition);
          downloadName = detectedName || expectedName;
          pdfBlob = response.data;
        } catch (incrementalError) {
          console.warn(
            '[handleSaveToWorkbench] Incremental export failed, falling back to full export',
            incrementalError,
          );
          // Fall through to full export
          if (isLazyMode && totalPages > 0) {
            const allPageIndices = Array.from({ length: totalPages }, (_, index) => index);
            await ensureImagesForPages(allPageIndices);
          }

          const payload = buildPayload();
          if (!payload) {
            throw new Error('Failed to build payload');
          }

          const { document, filename } = payload;
          const serialized = JSON.stringify(document);
          const jsonFile = new File([serialized], filename, { type: 'application/json' });

          const formData = new FormData();
          formData.append('fileInput', jsonFile);
          const response = await apiClient.post(CONVERSION_ENDPOINTS['text-editor-pdf'], formData, {
            responseType: 'blob',
          });

          const contentDisposition = response.headers?.['content-disposition'] ?? '';
          const detectedName = getFilenameFromHeaders(contentDisposition);
          const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
          downloadName = detectedName || `${baseName || 'document'}.pdf`;
          pdfBlob = response.data;
        }
      } else {
        if (isLazyMode && totalPages > 0) {
          const allPageIndices = Array.from({ length: totalPages }, (_, index) => index);
          await ensureImagesForPages(allPageIndices);
        }

        const payload = buildPayload();
        if (!payload) {
          throw new Error('Failed to build payload');
        }

        const { document, filename } = payload;
        const serialized = JSON.stringify(document);
        const jsonFile = new File([serialized], filename, { type: 'application/json' });

        const formData = new FormData();
        formData.append('fileInput', jsonFile);
        const response = await apiClient.post(CONVERSION_ENDPOINTS['text-editor-pdf'], formData, {
          responseType: 'blob',
        });

        const contentDisposition = response.headers?.['content-disposition'] ?? '';
        const detectedName = getFilenameFromHeaders(contentDisposition);
        const baseName = sanitizeBaseName(filename).replace(/-edited$/u, '');
        downloadName = detectedName || `${baseName || 'document'}.pdf`;
        pdfBlob = response.data;
      }

      // Create the new PDF file
      const pdfFile = new File([pdfBlob], downloadName, { type: 'application/pdf' });

      // Create StirlingFile and stub for the output
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [pdfFile],
        parentStub,
        'pdfTextEditor',
      );

      // Replace the original file with the edited version
      await consumeFiles([sourceFileIdRef.current as any], stirlingFiles, stubs);

      // Update the source file ID to point to the new file
      sourceFileIdRef.current = stubs[0].id;

      // Clear the unsaved changes flag - this will trigger the useEffect to navigate
      // once React has processed the state update
      navigationActions.setHasUnsavedChanges(false);
      setErrorMessage(null);
      
      // Set flag to trigger navigation after state update is processed
      setShouldNavigateAfterSave(true);
    } catch (error: any) {
      console.error('Failed to save to workbench', error);
      const message =
        error?.response?.data ||
        error?.message ||
        t('pdfTextEditor.errors.pdfConversion', 'Unable to save changes to workbench.');
      const msgString = typeof message === 'string' ? message : String(message);
      setErrorMessage(msgString);
      if (onError) {
        onError(msgString);
      }
    } finally {
      setIsSavingToWorkbench(false);
    }
  }, [
    buildPayload,
    cachedJobId,
    consumeFiles,
    groupsByPage,
    handleGeneratePdf,
    imagesByPage,
    isLazyMode,
    loadImagesForPage,
    navigationActions,
    onError,
    selectors,
    t,
  ]);

  const requestPagePreview = useCallback(
    async (pageIndex: number, scale: number) => {
      if (!hasVectorPreview || !pdfDocumentRef.current) {
        return;
      }
      const currentToken = previewRequestIdRef.current;
      const recordedScale = previewScaleRef.current.get(pageIndex);
      if (
        pagePreviewsRef.current.has(pageIndex) &&
        recordedScale !== undefined &&
        Math.abs(recordedScale - scale) < 0.05
      ) {
        return;
      }
      if (previewRenderingRef.current.has(pageIndex)) {
        return;
      }
      previewRenderingRef.current.add(pageIndex);
      try {
        const page = await pdfDocumentRef.current.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) {
          page.cleanup();
          return;
        }
        await page.render({ canvas, canvasContext: context, viewport }).promise;

        try {
          const textContent = await page.getTextContent();
          const maskMarginX = 0;
          const maskMarginTop = 0;
          const maskMarginBottom = Math.max(3 * scale, 3);
          context.save();
          context.globalCompositeOperation = 'destination-out';
          context.fillStyle = '#000000';
          for (const item of textContent.items) {
            // Skip TextMarkedContent items, only process TextItem
            if (!('transform' in item)) continue;

            const transform = Util.transform(viewport.transform, item.transform);
            const a = transform[0];
            const b = transform[1];
            const c = transform[2];
            const d = transform[3];
            const e = transform[4];
            const f = transform[5];
            const angle = Math.atan2(b, a);

            const width = (item.width || 0) * viewport.scale + maskMarginX * 2;
            const fontHeight = Math.hypot(c, d);
            const rawHeight = item.height ? item.height * viewport.scale : fontHeight;
            const height = Math.max(rawHeight + maskMarginTop + maskMarginBottom, fontHeight + maskMarginTop + maskMarginBottom);
            const baselineOffset = height - maskMarginBottom;

            context.save();
            context.translate(e, f);
            context.rotate(angle);
            context.fillRect(-maskMarginX, -baselineOffset, width, height);
            context.restore();
          }
          context.restore();
        } catch (textError) {
          console.warn('[PdfTextEditor] Failed to strip text from preview', textError);
        }

        // Also mask out images to prevent ghost/shadow images when they're moved
        try {
          const pageImages = imagesByPage[pageIndex] ?? [];
          if (pageImages.length > 0) {
            context.save();
            context.globalCompositeOperation = 'destination-out';
            context.fillStyle = '#000000';
            for (const image of pageImages) {
              if (!image) continue;
              // Get image bounds in PDF coordinates
              const left = image.left ?? image.x ?? 0;
              const bottom = image.bottom ?? image.y ?? 0;
              const width = image.width ?? Math.max((image.right ?? left) - left, 0);
              const height = image.height ?? Math.max((image.top ?? bottom) - bottom, 0);
              const _right = left + width;
              const top = bottom + height;

              // Convert to canvas coordinates (PDF origin is bottom-left, canvas is top-left)
              const canvasX = left * scale;
              const canvasY = canvas.height - top * scale;
              const canvasWidth = width * scale;
              const canvasHeight = height * scale;
              context.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
            }
            context.restore();
          }
        } catch (imageError) {
          console.warn('[PdfTextEditor] Failed to strip images from preview', imageError);
        }
        const dataUrl = canvas.toDataURL('image/png');
        page.cleanup();
        if (previewRequestIdRef.current !== currentToken) {
          return;
        }
        previewScaleRef.current.set(pageIndex, scale);
        setPagePreviews((prev) => {
          const next = new Map(prev);
          next.set(pageIndex, dataUrl);
          return next;
        });
      } catch (error) {
        console.warn('[PdfTextEditor] Failed to render page preview', error);
      } finally {
        previewRenderingRef.current.delete(pageIndex);
      }
    },
    [hasVectorPreview, imagesByPage],
  );

  // Re-group text when grouping mode changes without forcing a full reload
  useEffect(() => {
    const currentDocument = loadedDocumentRef.current;
    if (currentDocument) {
      resetToDocument(currentDocument, groupingMode);
    }
  }, [groupingMode, resetToDocument]);

  const viewData = useMemo<PdfTextEditorViewData>(() => ({
    document: loadedDocument,
    groupsByPage,
    imagesByPage,
    pagePreviews,
    selectedPage,
    dirtyPages,
    hasDocument,
    hasVectorPreview,
    fileName,
    errorMessage,
    isGeneratingPdf,
    isSavingToWorkbench,
    isConverting,
    conversionProgress,
    hasChanges,
    forceSingleTextElement,
    groupingMode,
    requestPagePreview,
    onSelectPage: handleSelectPage,
    onGroupEdit: handleGroupTextChange,
    onGroupDelete: handleGroupDelete,
    onImageTransform: handleImageTransform,
    onImageReset: handleImageReset,
    onReset: handleResetEdits,
    onDownloadJson: handleDownloadJson,
    onGeneratePdf: handleGeneratePdf,
    onGeneratePdfForNavigation: async () => {
      // Generate PDF without triggering tool completion
      await handleGeneratePdf(true);
    },
    onSaveToWorkbench: handleSaveToWorkbench,
    onForceSingleTextElementChange: setForceSingleTextElement,
    onGroupingModeChange: setGroupingMode,
    onMergeGroups: handleMergeGroups,
    onUngroupGroup: handleUngroupGroup,
    onLoadFile: handleLoadFileFromDropzone,
  }), [
    handleMergeGroups,
    handleUngroupGroup,
    handleImageTransform,
    handleSaveToWorkbench,
    imagesByPage,
    isSavingToWorkbench,
    pagePreviews,
    dirtyPages,
    errorMessage,
    fileName,
    groupsByPage,
    handleDownloadJson,
    handleGeneratePdf,
    handleGroupTextChange,
    handleGroupDelete,
    handleImageReset,
    handleResetEdits,
    handleSelectPage,
    hasChanges,
    hasDocument,
    hasVectorPreview,
    isGeneratingPdf,
    isConverting,
    conversionProgress,
    loadedDocument,
    selectedPage,
    forceSingleTextElement,
    groupingMode,
    requestPagePreview,
    setForceSingleTextElement,
    handleLoadFileFromDropzone,
  ]);

  const latestViewDataRef = useRef<PdfTextEditorViewData>(viewData);
  latestViewDataRef.current = viewData;

  // Trigger initial image loading in lazy mode
  useEffect(() => {
    if (isLazyMode && loadedDocument) {
      void loadImagesForPage(selectedPage);
    }
  }, [isLazyMode, loadedDocument, selectedPage, loadImagesForPage]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      autoLoadKeyRef.current = null;
      sourceFileIdRef.current = null;
      return;
    }

    if (navigationState.selectedTool !== 'pdfTextEditor') {
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
    // Capture the source file ID for save-to-workbench functionality
    sourceFileIdRef.current = (file as any).fileId ?? null;
    void handleLoadFile(file);
  }, [selectedFiles, navigationState.selectedTool, handleLoadFile]);

  // Auto-navigate to workbench when tool is selected
  const hasAutoOpenedWorkbenchRef = useRef(false);
  useEffect(() => {
    if (navigationState.selectedTool !== 'pdfTextEditor') {
      hasAutoOpenedWorkbenchRef.current = false;
      return;
    }

    if (hasAutoOpenedWorkbenchRef.current) {
      return;
    }

    hasAutoOpenedWorkbenchRef.current = true;
    // Use timeout to ensure registration effect has run first
    setTimeout(() => {
      navigationActions.setWorkbench(WORKBENCH_ID);
    }, 0);
  }, [navigationActions, navigationState.selectedTool]);

  // Register workbench view (re-runs when dependencies change)
  useEffect(() => {
    registerCustomWorkbenchView({
      id: WORKBENCH_VIEW_ID,
      workbenchId: WORKBENCH_ID,
      label: viewLabel,
      icon: <DescriptionIcon fontSize="small" />,
      component: PdfTextEditorView,
    });
    setLeftPanelView('hidden');
    setCustomWorkbenchViewData(WORKBENCH_VIEW_ID, latestViewDataRef.current);
  }, [
    registerCustomWorkbenchView,
    setCustomWorkbenchViewData,
    setLeftPanelView,
    viewLabel,
  ]);

  // Cleanup ONLY on component unmount (not on re-renders)
  useEffect(() => {
    return () => {
      // Clear backend cache when leaving the tool
      const jobId = cachedJobIdRef.current;
      if (jobId) {
        console.log(`[PdfTextEditor] Cleaning up cached document on unmount: ${jobId}`);
        apiClient.post(`/api/v1/convert/pdf/text-editor/clear-cache/${jobId}`).catch((error) => {
          console.warn('[PdfTextEditor] Failed to clear cache on unmount:', error);
        });
      }
      clearCustomWorkbenchViewData(WORKBENCH_VIEW_ID);
      unregisterCustomWorkbenchView(WORKBENCH_VIEW_ID);
      setLeftPanelView('toolPicker');
    };
  }, []); // Empty deps = cleanup only on unmount

  // Note: Compare tool doesn't auto-force workbench, and neither should we
  // The workbench should be set when the tool is selected via proper channels
  // (tool registry, tool picker, etc.) - not forced here

  const lastSentViewDataRef = useRef<PdfTextEditorViewData | null>(null);

  useEffect(() => {
    if (lastSentViewDataRef.current === viewData) {
      return;
    }
    lastSentViewDataRef.current = viewData;
    setCustomWorkbenchViewData(WORKBENCH_VIEW_ID, viewData);
  }, [setCustomWorkbenchViewData, viewData]);

  // All editing happens in the custom workbench view.
  return null;
};

(PdfTextEditor as ToolComponent).tool = () => {
  throw new Error('PDF JSON Editor does not support automation operations.');
};

(PdfTextEditor as ToolComponent).getDefaultParameters = () => ({
  groups: [],
});

export default PdfTextEditor as ToolComponent;
