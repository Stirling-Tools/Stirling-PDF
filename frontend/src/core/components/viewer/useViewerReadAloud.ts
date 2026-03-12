import { useCallback, useEffect, useRef, useState } from 'react';
import { computeReadAloudHighlightRect } from '@app/components/viewer/readAloudHighlight';
import { useFileState } from '@app/contexts/FileContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { pdfWorkerManager } from '@app/services/pdfWorkerManager';

interface TextItemWithGeometry {
  str: string;
  transform: number[];
  width: number;
  height: number;
  viewportTransform: number[];
}

function isTextItem(value: unknown): value is {
  str: string;
  transform: number[];
  width: number;
  height: number;
} {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.str === 'string' &&
    Array.isArray(item.transform) &&
    typeof item.width === 'number' &&
    typeof item.height === 'number'
  );
}

function createHighlightElement(item: TextItemWithGeometry, pageEl: HTMLElement): HTMLElement | null {
  const highlightRect = computeReadAloudHighlightRect({
    viewportTransform: item.viewportTransform,
    textTransform: item.transform,
    itemWidth: item.width,
    itemHeight: item.height,
  });
  if (!highlightRect) return null;

  const highlight = document.createElement('div');
  highlight.style.position = 'absolute';
  highlight.style.left = `${highlightRect.left}px`;
  highlight.style.top = `${highlightRect.top}px`;
  highlight.style.width = `${highlightRect.width}px`;
  highlight.style.height = `${highlightRect.height}px`;
  highlight.style.backgroundColor = 'rgba(255, 193, 7, 0.6)';
  highlight.style.pointerEvents = 'none';
  highlight.style.zIndex = '999';
  highlight.style.borderRadius = '2px';
  pageEl.appendChild(highlight);

  return highlight;
}

export function useViewerReadAloud() {
  const viewer = useViewer();
  const { selectors } = useFileState();

  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const highlightedElementsRef = useRef<HTMLElement[]>([]);
  const textItemsRef = useRef<TextItemWithGeometry[]>([]);
  const speechTextRef = useRef('');
  const speechWordsRef = useRef<string[]>([]);
  const speechCharIndexRef = useRef(0);
  const currentWordIndexRef = useRef(0);
  const currentPageNumberRef = useRef(1);
  const restartingSpeechRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const pageAdvanceTimeoutRef = useRef<number | null>(null);
  const currentFileRef = useRef<any>(null);
  const totalPagesRef = useRef(0);

  const clearHighlights = useCallback(() => {
    highlightedElementsRef.current.forEach((el) => el.remove());
    highlightedElementsRef.current = [];
  }, []);

  const highlightWord = useCallback((wordIndex: number, words: string[], pageNumber: number) => {
    clearHighlights();
    if (wordIndex < 0 || wordIndex >= words.length) return;

    const wordToFind = words[wordIndex];
    if (!wordToFind) return;

    try {
      let currentWordCount = 0;
      const currentPageIndex = pageNumber - 1;
      const pageEl = document.querySelector(`[data-page-index="${currentPageIndex}"]`) as HTMLElement | null;
      if (!pageEl) return;

      for (const item of textItemsRef.current) {
        const itemText = item.str.trim();
        if (!itemText) continue;

        const subWords = itemText.split(/\s+/);
        for (let i = 0; i < subWords.length; i++) {
          if (currentWordCount === wordIndex && subWords[i].toLowerCase() === wordToFind.toLowerCase()) {
            const highlight = createHighlightElement(item, pageEl);
            if (highlight) {
              highlightedElementsRef.current.push(highlight);
            }
            return;
          }
          currentWordCount++;
        }
      }
    } catch {
      // Highlighting is best-effort only.
    }
  }, [clearHighlights]);

  const readPage = useCallback(async (
    currentFile: any,
    pageNumber: number,
    options?: {
      preserveSpeechState?: boolean;
      highlightWordIndex?: number;
    }
  ) => {
    let pdfDoc: Awaited<ReturnType<typeof pdfWorkerManager.createDocument>> | null = null;

    try {
      const zoom = (viewer.getZoomState().zoomPercent || 100) / 100;

      pdfDoc = await pdfWorkerManager.createDocument(await currentFile.arrayBuffer());
      const page = await pdfDoc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      // The highlight is rendered inside the page element, so we keep geometry in
      // page-local coordinates and let the viewer's own rotation transform it.
      const viewportTransform = page.getViewport({ scale: zoom }).transform;

      const textItems: TextItemWithGeometry[] = [];
      for (const item of textContent.items) {
        if (!isTextItem(item)) continue;
        textItems.push({
          ...item,
          viewportTransform,
        });
      }
      textItemsRef.current = textItems;

      const spokenText = textContent.items
        .map((item) => (isTextItem(item) ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!spokenText) {
        return null;
      }

      const words = spokenText.split(/\s+/).filter(Boolean);
      if (!options?.preserveSpeechState) {
        speechTextRef.current = spokenText;
        speechWordsRef.current = words;
        speechCharIndexRef.current = 0;
        currentWordIndexRef.current = 0;
      }

      const highlightIndex = Math.max(0, Math.min(options?.highlightWordIndex ?? 0, Math.max(words.length - 1, 0)));
      highlightWord(highlightIndex, words, pageNumber);
      return { spokenText, words };
    } finally {
      if (pdfDoc) {
        pdfWorkerManager.destroyDocument(pdfDoc);
      }
    }
  }, [highlightWord, viewer]);

  const speakFromCharIndex = useCallback((
    spokenText: string,
    words: string[],
    startCharIndex: number,
    pageNumber: number,
    rateOverride?: number,
  ) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    const clampedStart = Math.max(0, Math.min(startCharIndex, spokenText.length));
    const remainingText = spokenText.slice(clampedStart).trimStart();
    const trimmedDelta = spokenText.slice(clampedStart).length - remainingText.length;
    const baseCharIndex = clampedStart + trimmedDelta;

    if (!remainingText) {
      clearHighlights();
      setIsReadingAloud(false);
      currentFileRef.current = null;
      currentWordIndexRef.current = 0;
      utteranceRef.current = null;
      return;
    }

    const utterance = new SpeechSynthesisUtterance(remainingText);
    utterance.rate = rateOverride ?? speechRate;
    utterance.onstart = () => setIsReadingAloud(true);
    utterance.onend = () => {
      utteranceRef.current = null;
      if (restartingSpeechRef.current) {
        return;
      }
      if (currentFileRef.current && pageNumber < totalPagesRef.current) {
        clearHighlights();
        speechCharIndexRef.current = 0;
        currentWordIndexRef.current = 0;
        currentPageNumberRef.current = pageNumber + 1;
        viewer.scrollActions.scrollToPage(pageNumber + 1, 'smooth');
        if (pageAdvanceTimeoutRef.current !== null) {
          window.clearTimeout(pageAdvanceTimeoutRef.current);
        }
        pageAdvanceTimeoutRef.current = window.setTimeout(async () => {
          pageAdvanceTimeoutRef.current = null;
          try {
            const nextPageData = await readPage(currentFileRef.current, pageNumber + 1);
            if (!nextPageData) {
              currentFileRef.current = null;
              setIsReadingAloud(false);
              return;
            }
            speakFromCharIndex(nextPageData.spokenText, nextPageData.words, 0, pageNumber + 1, speechRate);
          } catch (error) {
            console.error('Read aloud page advance failed', error);
            currentFileRef.current = null;
            clearHighlights();
            setIsReadingAloud(false);
          }
        }, 250);
        return;
      }
      clearHighlights();
      setIsReadingAloud(false);
      speechCharIndexRef.current = spokenText.length;
      currentFileRef.current = null;
      currentWordIndexRef.current = 0;
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      if (restartingSpeechRef.current) {
        return;
      }
      restartingSpeechRef.current = false;
      currentFileRef.current = null;
      currentWordIndexRef.current = 0;
      clearHighlights();
      setIsReadingAloud(false);
    };
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name !== 'word') return;

      const absoluteCharIndex = baseCharIndex + event.charIndex;
      speechCharIndexRef.current = absoluteCharIndex;

      let charCount = 0;
      for (let i = 0; i < words.length; i++) {
        const wordStart = charCount;
        const wordEnd = charCount + words[i].length;
        if (absoluteCharIndex >= wordStart && absoluteCharIndex < wordEnd) {
          currentWordIndexRef.current = i;
          currentPageNumberRef.current = pageNumber;
          highlightWord(i, words, pageNumber);
          break;
        }
        charCount = wordEnd + 1;
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [clearHighlights, readPage, speechRate, viewer.scrollActions]);

  const refreshActiveHighlight = useCallback(() => {
    if (!isReadingAloud || !currentFileRef.current) {
      return;
    }

    void readPage(currentFileRef.current, currentPageNumberRef.current, {
      preserveSpeechState: true,
      highlightWordIndex: currentWordIndexRef.current,
    }).catch(() => {
      // Keep playback running even if highlight refresh fails.
    });
  }, [isReadingAloud, readPage]);

  const handleReadAloud = useCallback(async () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    if (isReadingAloud) {
      restartingSpeechRef.current = false;
      if (pageAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(pageAdvanceTimeoutRef.current);
        pageAdvanceTimeoutRef.current = null;
      }
      window.speechSynthesis.cancel();
      clearHighlights();
      setIsReadingAloud(false);
      currentFileRef.current = null;
      utteranceRef.current = null;
      return;
    }

    try {
      const selectedFiles = selectors.getSelectedFiles();
      const currentFile = selectedFiles[viewer.activeFileIndex] ?? selectedFiles[0];
      if (!currentFile) return;
      currentFileRef.current = currentFile;
      totalPagesRef.current = viewer.getScrollState().totalPages || 0;

      setIsReadingAloud(true);
      try {
        const currentPage = viewer.getScrollState().currentPage || 1;
        currentPageNumberRef.current = currentPage;
        const pageData = await readPage(currentFile, currentPage);
        if (!pageData) {
          currentFileRef.current = null;
          setIsReadingAloud(false);
          return;
        }

        window.speechSynthesis.cancel();
        speakFromCharIndex(pageData.spokenText, pageData.words, 0, currentPage, speechRate);
      } finally {
        // readPage handles pdf worker cleanup
      }
    } catch (error) {
      console.error('Read aloud failed', error);
      currentFileRef.current = null;
      clearHighlights();
      setIsReadingAloud(false);
    }
  }, [clearHighlights, highlightWord, isReadingAloud, selectors, speakFromCharIndex, speechRate, viewer]);

  const handleSpeechRateChange = useCallback((nextRate: number) => {
    setSpeechRate(nextRate);

    if (!isReadingAloud || !utteranceRef.current || !speechTextRef.current || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    restartingSpeechRef.current = true;
    setIsReadingAloud(true);
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
    }
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null;
      if (!restartingSpeechRef.current) {
        return;
      }
      restartingSpeechRef.current = false;
      speakFromCharIndex(
        speechTextRef.current,
        speechWordsRef.current,
        speechCharIndexRef.current,
        viewer.getScrollState().currentPage || 1,
        nextRate
      );
    }, 80);
  }, [isReadingAloud, speakFromCharIndex, viewer]);

  useEffect(() => {
    return viewer.registerImmediateZoomUpdate(() => {
      requestAnimationFrame(() => {
        refreshActiveHighlight();
      });
    });
  }, [refreshActiveHighlight, viewer]);

  useEffect(() => {
    return viewer.registerImmediateScrollUpdate(() => {
      requestAnimationFrame(() => {
        refreshActiveHighlight();
      });
    });
  }, [refreshActiveHighlight, viewer]);

  useEffect(() => {
    return () => {
      if (restartTimeoutRef.current !== null) {
        window.clearTimeout(restartTimeoutRef.current);
      }
      if (pageAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(pageAdvanceTimeoutRef.current);
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      restartingSpeechRef.current = false;
      clearHighlights();
      currentFileRef.current = null;
      currentWordIndexRef.current = 0;
      utteranceRef.current = null;
    };
  }, [clearHighlights]);

  return {
    isReadingAloud,
    speechRate,
    handleReadAloud,
    handleSpeechRateChange,
  };
}
