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
import { pdfWorkerManager } from '@core/services/pdfWorkerManager';
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PdfJsonDocument,
  PdfJsonImageElement,
  PdfJsonPage,
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
import type { PDFDocumentProxy } from 'pdfjs-dist';

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
  const [conversionProgress, setConversionProgress] = useState<{
    percent: number;
    stage: string;
    message: string;
  } | null>(null);
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
  const imagesByPageRef = useRef<PdfJsonImageElement[][]>([]);
  const autoLoadKeyRef = useRef<string | null>(null);
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

  const dirtyPages = useMemo(
    () => getDirtyPages(groupsByPage, imagesByPage, originalImagesRef.current),
    [groupsByPage, imagesByPage],
  );
  const hasChanges = useMemo(() => dirtyPages.some(Boolean), [dirtyPages]);
  const hasDocument = loadedDocument !== null;
  const viewLabel = useMemo(() => t('pdfJsonEditor.viewLabel', 'PDF Editor'), [t]);
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
      return;
    }
    const cloned = deepCloneDocument(document);
    const groups = groupDocumentText(cloned, mode);
    const images = extractDocumentImages(cloned);
    const originalImages = images.map((page) => page.map(cloneImageElement));
    originalImagesRef.current = originalImages;
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
    console.log(`[PdfJsonEditor] Cleaning up cached document for jobId: ${jobId}`);
    apiClient.post(`/api/v1/convert/pdf/json/clear-cache/${jobId}`).catch((error) => {
      console.warn('[PdfJsonEditor] Failed to clear cache:', error);
    });
  }, []);

  useEffect(() => {
    const previousJobId = cachedJobIdRef.current;
    if (previousJobId && previousJobId !== cachedJobId) {
      clearCachedJob(previousJobId);
    }
    cachedJobIdRef.current = cachedJobId;
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
          console.warn('[PdfJsonEditor] Failed to initialise PDF preview:', error);
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
          `/api/v1/convert/pdf/json/page/${cachedJobId}/${pageNumber}`,
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
      } finally {
        loadingImagePagesRef.current.delete(pageIndex);
        setLoadingImagePages((prev) => {
          const next = new Set(prev);
          next.delete(pageIndex);
          return next;
        });
      }
    },
    [isLazyMode, cachedJobId],
  );

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
        let parsed: PdfJsonDocument | null = null;
        let shouldUseLazyMode = false;
        let pendingJobId: string | null = null;

        setErrorMessage(null);

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
            `${CONVERSION_ENDPOINTS['pdf-json']}?async=true&lightweight=true`,
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

          while (!jobComplete && attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            attempts += 1;

            try {
              const statusResponse = await apiClient.get(`/api/v1/general/job/${jobId}`);
              const jobStatus = statusResponse.data;
              console.log(`Job status (attempt ${attempts}):`, jobStatus);

              if (jobStatus.notes && jobStatus.notes.length > 0) {
                const lastNote = jobStatus.notes[jobStatus.notes.length - 1];
                console.log('Latest note:', lastNote);
                const matchWithCount = lastNote.match(
                  /\[(\d+)%\]\s+(\w+):\s+(.+?)\s+\((\d+)\/(\d+)\)/,
                );
                if (matchWithCount) {
                  const percent = parseInt(matchWithCount[1], 10);
                  const stage = matchWithCount[2];
                  const message = matchWithCount[3];
                  const current = parseInt(matchWithCount[4], 10);
                  const total = parseInt(matchWithCount[5], 10);
                  setConversionProgress({
                    percent,
                    stage,
                    message,
                    current,
                    total,
                  });
                } else {
                  const match = lastNote.match(/\[(\d+)%\]\s+(\w+):\s+(.+)/);
                  if (match) {
                    const percent = parseInt(match[1], 10);
                    const stage = match[2];
                    const message = match[3];
                    setConversionProgress({
                      percent,
                      stage,
                      message,
                    });
                  }
                }
              } else if (jobStatus.progress !== undefined) {
                const percent = Math.min(Math.max(jobStatus.progress, 0), 100);
                setConversionProgress({
                  percent,
                  stage: jobStatus.stage || 'processing',
                  message: jobStatus.note || 'Converting PDF to JSON...',
                });
              }

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
          `[PdfJsonEditor] Document loaded. Lazy image mode: ${shouldUseLazyMode}, Pages: ${
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
        setCachedJobId(shouldUseLazyMode ? pendingJobId : null);
        setFileName(file.name);
        setErrorMessage(null);
        autoLoadKeyRef.current = fileKey;
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

        if (isPdf) {
          const errorMsg =
            error?.message ||
            t('pdfJsonEditor.conversionFailed', 'Failed to convert PDF. Please try again.');
          setErrorMessage(errorMsg);
          console.error('Setting error message:', errorMsg);
        } else {
          setErrorMessage(
            t(
              'pdfJsonEditor.errors.invalidJson',
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
    setGroupsByPage((previous) =>
      previous.map((groups, idx) =>
        idx !== pageIndex
          ? groups
          : groups.map((group) => (group.id === groupId ? { ...group, text: '' } : group))
      )
    );
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

  const handleGeneratePdf = useCallback(async () => {
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
            return;
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
            `/api/v1/convert/pdf/json/partial/${cachedJobId}?filename=${encodeURIComponent(expectedName)}`,
            partialDocument,
            {
              responseType: 'blob',
            },
          );

          const contentDisposition = response.headers?.['content-disposition'] ?? '';
          const detectedName = getFilenameFromHeaders(contentDisposition);
          const downloadName = detectedName || expectedName;

          downloadBlob(response.data, downloadName);

          if (onComplete) {
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
        await page.render({ canvasContext: context, viewport }).promise;

        try {
          const textContent = await page.getTextContent();
          const maskMarginX = 0;
          const maskMarginTop = 0;
          const maskMarginBottom = Math.max(3 * scale, 3);
          context.save();
          context.globalCompositeOperation = 'destination-out';
          context.fillStyle = '#000000';
          for (const item of textContent.items) {
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
          console.warn('[PdfJsonEditor] Failed to strip text from preview', textError);
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
        console.warn('[PdfJsonEditor] Failed to render page preview', error);
      } finally {
        previewRenderingRef.current.delete(pageIndex);
      }
    },
    [hasVectorPreview],
  );

  // Re-group text when grouping mode changes without forcing a full reload
  useEffect(() => {
    const currentDocument = loadedDocumentRef.current;
    if (currentDocument) {
      resetToDocument(currentDocument, groupingMode);
    }
  }, [groupingMode, resetToDocument]);

  const viewData = useMemo<PdfJsonEditorViewData>(() => ({
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
    isConverting,
    conversionProgress,
    hasChanges,
    forceSingleTextElement,
    groupingMode,
    requestPagePreview,
    onLoadJson: handleLoadFile,
    onSelectPage: handleSelectPage,
    onGroupEdit: handleGroupTextChange,
    onGroupDelete: handleGroupDelete,
    onImageTransform: handleImageTransform,
    onImageReset: handleImageReset,
    onReset: handleResetEdits,
    onDownloadJson: handleDownloadJson,
    onGeneratePdf: handleGeneratePdf,
    onForceSingleTextElementChange: setForceSingleTextElement,
    onGroupingModeChange: setGroupingMode,
  }), [
    handleImageTransform,
    imagesByPage,
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
    handleLoadFile,
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
  ]);

  const latestViewDataRef = useRef<PdfJsonEditorViewData>(viewData);
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
      // Clear backend cache if we were using lazy loading
      clearCachedJob(cachedJobIdRef.current);
      clearCustomWorkbenchViewData(VIEW_ID);
      unregisterCustomWorkbenchView(VIEW_ID);
      setLeftPanelView('toolPicker');
    };
  }, [
    clearCachedJob,
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
