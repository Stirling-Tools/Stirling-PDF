import { useCallback, useEffect, useRef, useState } from "react";
import { computeReadAloudHighlightRect } from "@editor/components/viewer/readAloudHighlight";
import {
  READ_ALOUD_FROM_SELECTION_EVENT,
  findReadAloudStartIndex,
  type ReadAloudFromSelectionDetail,
} from "@editor/components/viewer/readAloudFromSelection";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useStopReadAloudOnNavigation } from "@editor/components/viewer/useStopReadAloudOnNavigation";
import { pdfWorkerManager } from "@editor/services/pdfWorkerManager";
import { StirlingFile } from "@editor/types/fileContext";
import { ZINDEX } from "@editor/constants/zIndex";

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
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.str === "string" &&
    Array.isArray(item.transform) &&
    typeof item.width === "number" &&
    typeof item.height === "number"
  );
}

function createHighlightElement(
  item: TextItemWithGeometry,
  pageEl: HTMLElement,
): HTMLElement | null {
  const highlightRect = computeReadAloudHighlightRect({
    viewportTransform: item.viewportTransform,
    textTransform: item.transform,
    itemWidth: item.width,
    itemHeight: item.height,
  });
  if (!highlightRect) return null;

  const highlight = document.createElement("div");
  highlight.style.position = "absolute";
  highlight.style.left = `${highlightRect.left}px`;
  highlight.style.top = `${highlightRect.top}px`;
  highlight.style.width = `${highlightRect.width}px`;
  highlight.style.height = `${highlightRect.height}px`;
  highlight.style.backgroundColor = "rgba(255, 193, 7, 0.6)";
  highlight.style.pointerEvents = "none";
  highlight.style.zIndex = String(ZINDEX.VIEWER_HIGHLIGHT);
  highlight.style.borderRadius = "2px";
  pageEl.appendChild(highlight);

  return highlight;
}

/** -1 when `charIndex` falls on the space between two words. */
function wordIndexAtChar(words: string[], charIndex: number): number {
  let wordStart = 0;
  for (let i = 0; i < words.length; i++) {
    const wordEnd = wordStart + words[i].length;
    if (charIndex < wordEnd) return charIndex >= wordStart ? i : -1;
    wordStart = wordEnd + 1;
  }
  return -1;
}

/**
 * `displayedFile` is the document the viewer is showing, preview included:
 * read-aloud and the selection menu must speak the same file the user sees.
 */
export function useViewerReadAloud(
  defaultLanguage?: string,
  displayedFile?: StirlingFile | File | null,
) {
  const viewer = useViewer();

  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [speechLanguage, setSpeechLanguage] = useState(
    defaultLanguage || "en-US",
  );
  const [speechVoice, setSpeechVoice] = useState<SpeechSynthesisVoice | null>(
    null,
  );
  const [supportedLanguageCodes, setSupportedLanguageCodes] = useState<
    Set<string>
  >(new Set());

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const highlightedElementsRef = useRef<HTMLElement[]>([]);
  const textItemsRef = useRef<TextItemWithGeometry[]>([]);
  const speechTextRef = useRef("");
  const speechWordsRef = useRef<string[]>([]);
  const speechCharIndexRef = useRef(0);
  const currentWordIndexRef = useRef(0);
  const currentPageNumberRef = useRef(1);
  const restartingSpeechRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const pageAdvanceTimeoutRef = useRef<number | null>(null);
  const currentFileRef = useRef<StirlingFile | File | null>(null);
  // Bumped whenever reading starts or stops; async work started under an
  // older value must not speak or tear down the session that replaced it.
  const sessionRef = useRef(0);
  const totalPagesRef = useRef(0);
  const speechRateRef = useRef(1); // Keep track of current rate without recreating dependent functions
  const speechLanguageRef = useRef(defaultLanguage || "en-US");

  // Cache parsed PDF document and page text items to avoid reparsing on every zoom/scroll
  const cachedPdfDocRef = useRef<Awaited<
    ReturnType<typeof pdfWorkerManager.createDocument>
  > | null>(null);
  const cachedPageNumberRef = useRef<number | null>(null);
  const cachedTextItemsRef = useRef<TextItemWithGeometry[] | null>(null);

  // Helper to find best voice for language
  const findVoiceForLanguage = useCallback(
    (languageCode: string): SpeechSynthesisVoice | null => {
      if (typeof window === "undefined" || !window.speechSynthesis) return null;

      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;

      // Try exact match first
      const exactMatch = voices.find((v) => v.lang === languageCode);
      if (exactMatch) return exactMatch;

      // Try matching just the language part (e.g., 'es' from 'es-ES')
      const baseLang = languageCode.split("-")[0];
      const baseMatch = voices.find((v) => v.lang.startsWith(baseLang));
      if (baseMatch) {
        return baseMatch;
      }

      // Fallback to any English voice if requested language not found
      const englishMatch = voices.find((v) => v.lang.startsWith("en"));
      if (englishMatch) {
        return englishMatch;
      }

      // Last resort: use any available voice
      return voices[0] || null;
    },
    [],
  );

  // Sync speechRate state to ref so page advance callbacks always have current rate
  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  // Sync speechLanguage state to ref
  useEffect(() => {
    speechLanguageRef.current = speechLanguage;
  }, [speechLanguage]);

  // Helper to get supported language codes from available voices
  const getSupportedLanguageCodes = useCallback((): Set<string> => {
    if (typeof window === "undefined" || !window.speechSynthesis)
      return new Set();

    const voices = window.speechSynthesis.getVoices();
    const supportedCodes = new Set<string>();

    // For each voice, add its language code and base language code
    voices.forEach((voice) => {
      supportedCodes.add(voice.lang);
      const baseLang = voice.lang.split("-")[0];
      supportedCodes.add(baseLang);
    });

    // Also add English as fallback
    supportedCodes.add("en");
    supportedCodes.add("en-GB");
    supportedCodes.add("en-US");

    return supportedCodes;
  }, []);

  // Wait for voices to load, then check if default language has a voice
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const handleVoicesChanged = () => {
      const supportedCodes = getSupportedLanguageCodes();
      setSupportedLanguageCodes(supportedCodes);
      // Once voices are loaded, update the voice for current language
      const voice = findVoiceForLanguage(speechLanguage);
      setSpeechVoice(voice);
    };

    // Check if voices are already loaded
    if (window.speechSynthesis.getVoices().length > 0) {
      const supportedCodes = getSupportedLanguageCodes();
      setSupportedLanguageCodes(supportedCodes);
      const voice = findVoiceForLanguage(speechLanguage);
      setSpeechVoice(voice);
    } else {
      // Voices not loaded yet, listen for voiceschanged event
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );
      return () => {
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          handleVoicesChanged,
        );
      };
    }
  }, [speechLanguage, findVoiceForLanguage, getSupportedLanguageCodes]);

  const clearHighlights = useCallback(() => {
    highlightedElementsRef.current.forEach((el) => el.remove());
    highlightedElementsRef.current = [];
  }, []);

  const cleanupReadingSession = useCallback(() => {
    // Destroy the cached PDF document to free memory
    if (cachedPdfDocRef.current) {
      pdfWorkerManager.destroyDocument(cachedPdfDocRef.current);
      cachedPdfDocRef.current = null;
      cachedPageNumberRef.current = null;
      cachedTextItemsRef.current = null;
    }
  }, []);

  const stopReadingAloud = useCallback(() => {
    sessionRef.current++;
    restartingSpeechRef.current = false;
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (pageAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(pageAdvanceTimeoutRef.current);
      pageAdvanceTimeoutRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    clearHighlights();
    setIsReadingAloud(false);
    currentFileRef.current = null;
    currentWordIndexRef.current = 0;
    utteranceRef.current = null;
    cleanupReadingSession();
  }, [clearHighlights, cleanupReadingSession]);

  // Stop reading when navigating away (workbench, file, or window change)
  useStopReadAloudOnNavigation(isReadingAloud, stopReadingAloud);

  // Stop reading when the displayed file itself is replaced. Navigation
  // watches the workbench and active index, but a preview or re-upload can
  // swap the file underneath both; without this, a pending read resolves
  // for the old file and speaks it over the replacement.
  const previousDisplayedFileRef = useRef(displayedFile);
  useEffect(() => {
    if (previousDisplayedFileRef.current === displayedFile) return;
    previousDisplayedFileRef.current = displayedFile;
    if (isReadingAloud) {
      stopReadingAloud();
    }
  }, [displayedFile, isReadingAloud, stopReadingAloud]);

  const highlightWord = useCallback(
    (wordIndex: number, words: string[], pageNumber: number) => {
      clearHighlights();
      if (wordIndex < 0 || wordIndex >= words.length) return;

      const wordToFind = words[wordIndex];
      if (!wordToFind) return;

      try {
        let currentWordCount = 0;
        const currentPageIndex = pageNumber - 1;
        const pageEl = document.querySelector(
          `[data-page-index="${currentPageIndex}"]`,
        ) as HTMLElement | null;
        if (!pageEl) return;

        for (const item of textItemsRef.current) {
          const itemText = item.str.trim();
          if (!itemText) continue;

          const subWords = itemText.split(/\s+/);
          for (let i = 0; i < subWords.length; i++) {
            if (
              currentWordCount === wordIndex &&
              subWords[i].toLowerCase() === wordToFind.toLowerCase()
            ) {
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
    },
    [clearHighlights],
  );

  /**
   * Parses one page's text for speaking. Null when the page has no text or
   * when `session` was superseded mid-parse, so callers check the session
   * before treating null as an empty page.
   */
  const readPage = useCallback(
    async (
      currentFile: StirlingFile | File,
      pageNumber: number,
      session: number,
    ) => {
      let pdfDoc: Awaited<
        ReturnType<typeof pdfWorkerManager.createDocument>
      > | null = null;

      try {
        const zoom = (viewer.getZoomState().zoomPercent || 100) / 100;

        // If we have a cached document for the same file, reuse it instead of recreating
        if (cachedPdfDocRef.current) {
          pdfDoc = cachedPdfDocRef.current;
        } else {
          const createdDoc = await pdfWorkerManager.createDocument(
            await currentFile.arrayBuffer(),
          );
          if (session !== sessionRef.current) {
            pdfWorkerManager.destroyDocument(createdDoc);
            return null;
          }
          pdfDoc = createdDoc;
          cachedPdfDocRef.current = pdfDoc;
        }

        const page = await pdfDoc.getPage(pageNumber);
        const textContent = await page.getTextContent();
        if (session !== sessionRef.current) return null;
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

        // Sort text items by visual position (top-to-bottom, then left-to-right)
        // to preserve reading order instead of PDF internal order
        const sortedItems = [...textItems].sort((a, b) => {
          // transform array is [a, b, c, d, e, f] where e=x, f=y (translation components)
          const yA = a.transform[5] ?? 0; // y position
          const yB = b.transform[5] ?? 0;
          const xA = a.transform[4] ?? 0; // x position
          const xB = b.transform[4] ?? 0;

          // Sort top-to-bottom (higher y first in PDF coordinates), then left-to-right
          // 5px threshold for "same line" to group text on same horizontal line
          if (Math.abs(yA - yB) > 5) {
            return yB - yA; // Top to bottom
          }
          return xA - xB; // Left to right
        });

        // Merge adjacent text items on same line, using PDF spaces as word boundaries
        // This fixes PDFs where characters/syllables are individual text items
        const mergedItems: TextItemWithGeometry[] = [];
        const CHAR_MERGE_THRESHOLD = 5; // px - merge adjacent chars/syllables closer than this

        for (const item of sortedItems) {
          const itemText = item.str;
          const isSpace = itemText.trim() === "";

          // Spaces mark word boundaries - always push them separately
          if (isSpace) {
            mergedItems.push(item);
            continue;
          }

          const lastItem = mergedItems[mergedItems.length - 1];

          // Only merge if last item exists, is not a space, and items are on same line
          if (lastItem && lastItem.str.trim()) {
            const yDiff = Math.abs(
              (lastItem.transform[5] ?? 0) - (item.transform[5] ?? 0),
            );
            const xGap =
              (item.transform[4] ?? 0) -
              ((lastItem.transform[4] ?? 0) + (lastItem.width ?? 0));

            // Same line and very close horizontally?
            if (yDiff < 5 && xGap < CHAR_MERGE_THRESHOLD) {
              lastItem.str += itemText;
              // Update width: add the new item's width plus any gap between them
              lastItem.width =
                (lastItem.width ?? 0) + Math.max(0, xGap) + (item.width ?? 0);
              continue;
            }
          }
          mergedItems.push({ ...item, str: itemText });
        }

        // Use merged items for both highlighting and caching
        // This ensures word counting in highlightWord matches the spoken text order
        textItemsRef.current = mergedItems;
        cachedTextItemsRef.current = mergedItems;
        cachedPageNumberRef.current = pageNumber;

        const spokenText = mergedItems
          .map((item) => item.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (!spokenText) {
          return null;
        }

        const words = spokenText.split(/\s+/).filter(Boolean);
        return { spokenText, words };
      } catch (error) {
        // Clear cache on error to avoid stale state
        if (pdfDoc && pdfDoc === cachedPdfDocRef.current) {
          cachedPdfDocRef.current = null;
        }
        throw error;
      }
    },
    [viewer],
  );

  const speakFromCharIndex = useCallback(
    (
      spokenText: string,
      words: string[],
      startCharIndex: number,
      pageNumber: number,
      rateOverride?: number,
      languageOverride?: string,
    ) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        return;
      }

      const clampedStart = Math.max(
        0,
        Math.min(startCharIndex, spokenText.length),
      );
      const remainingText = spokenText.slice(clampedStart).trimStart();
      const trimmedDelta =
        spokenText.slice(clampedStart).length - remainingText.length;
      const baseCharIndex = clampedStart + trimmedDelta;

      if (!remainingText) {
        clearHighlights();
        setIsReadingAloud(false);
        currentFileRef.current = null;
        currentWordIndexRef.current = 0;
        utteranceRef.current = null;
        cleanupReadingSession();
        return;
      }

      speechTextRef.current = spokenText;
      speechWordsRef.current = words;
      speechCharIndexRef.current = baseCharIndex;
      currentPageNumberRef.current = pageNumber;
      const startWordIndex = wordIndexAtChar(words, baseCharIndex);
      if (startWordIndex !== -1) {
        currentWordIndexRef.current = startWordIndex;
        highlightWord(startWordIndex, words, pageNumber);
      }

      const session = sessionRef.current;
      const utterance = new SpeechSynthesisUtterance(remainingText);
      utterance.rate = rateOverride ?? speechRateRef.current;
      const currentLang = languageOverride ?? speechLanguageRef.current;
      utterance.lang = currentLang;

      // Set specific voice if available
      const voice = findVoiceForLanguage(currentLang);
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => setIsReadingAloud(true);
      utterance.onend = () => {
        if (session !== sessionRef.current) return;
        utteranceRef.current = null;
        if (restartingSpeechRef.current) {
          return;
        }
        if (currentFileRef.current && pageNumber < totalPagesRef.current) {
          clearHighlights();
          speechCharIndexRef.current = 0;
          currentWordIndexRef.current = 0;
          currentPageNumberRef.current = pageNumber + 1;
          viewer.scrollActions.scrollToPage(pageNumber + 1, "smooth");
          if (pageAdvanceTimeoutRef.current !== null) {
            window.clearTimeout(pageAdvanceTimeoutRef.current);
          }
          pageAdvanceTimeoutRef.current = window.setTimeout(async () => {
            pageAdvanceTimeoutRef.current = null;
            try {
              if (!currentFileRef.current) {
                currentFileRef.current = null;
                setIsReadingAloud(false);
                cleanupReadingSession();
                return;
              }
              const nextPageData = await readPage(
                currentFileRef.current,
                pageNumber + 1,
                session,
              );
              if (session !== sessionRef.current) return;
              if (!nextPageData) {
                currentFileRef.current = null;
                setIsReadingAloud(false);
                cleanupReadingSession();
                return;
              }
              speakFromCharIndex(
                nextPageData.spokenText,
                nextPageData.words,
                0,
                pageNumber + 1,
                speechRateRef.current,
                speechLanguageRef.current,
              );
            } catch (error) {
              if (session !== sessionRef.current) return;
              console.error("Read aloud page advance failed", error);
              currentFileRef.current = null;
              clearHighlights();
              setIsReadingAloud(false);
              cleanupReadingSession();
            }
          }, 250);
          return;
        }
        clearHighlights();
        setIsReadingAloud(false);
        speechCharIndexRef.current = spokenText.length;
        currentFileRef.current = null;
        currentWordIndexRef.current = 0;
        cleanupReadingSession();
      };
      utterance.onerror = () => {
        if (session !== sessionRef.current) return;
        utteranceRef.current = null;
        if (restartingSpeechRef.current) {
          return;
        }
        restartingSpeechRef.current = false;
        currentFileRef.current = null;
        currentWordIndexRef.current = 0;
        clearHighlights();
        setIsReadingAloud(false);
        cleanupReadingSession();
      };
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name !== "word") return;

        const absoluteCharIndex = baseCharIndex + event.charIndex;
        speechCharIndexRef.current = absoluteCharIndex;

        const wordIndex = wordIndexAtChar(words, absoluteCharIndex);
        if (wordIndex === -1) return;
        currentWordIndexRef.current = wordIndex;
        currentPageNumberRef.current = pageNumber;
        highlightWord(wordIndex, words, pageNumber);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [
      clearHighlights,
      cleanupReadingSession,
      findVoiceForLanguage,
      highlightWord,
      readPage,
      viewer.scrollActions,
    ],
  );

  const refreshActiveHighlight = useCallback(() => {
    if (
      !isReadingAloud ||
      !currentFileRef.current ||
      !cachedTextItemsRef.current
    ) {
      return;
    }

    // Use cached text items to refresh highlights without reparsing the PDF document.
    // This is critical for performance during zoom/scroll updates while audio is playing.
    const words = speechWordsRef.current;
    const pageNumber = currentPageNumberRef.current;
    const wordIndex = currentWordIndexRef.current;

    highlightWord(wordIndex, words, pageNumber);
  }, [isReadingAloud, highlightWord]);

  const startReading = useCallback(
    async (
      pageNumber: number,
      findStartCharIndex?: (spokenText: string) => number,
    ) => {
      if (!displayedFile) return;
      const session = ++sessionRef.current;
      try {
        currentFileRef.current = displayedFile;
        totalPagesRef.current = viewer.getScrollState().totalPages || 0;

        setIsReadingAloud(true);
        const pageData = await readPage(displayedFile, pageNumber, session);
        if (session !== sessionRef.current) return;
        if (!pageData) {
          stopReadingAloud();
          return;
        }

        window.speechSynthesis.cancel();
        speakFromCharIndex(
          pageData.spokenText,
          pageData.words,
          findStartCharIndex?.(pageData.spokenText) ?? 0,
          pageNumber,
          speechRateRef.current,
          speechLanguageRef.current,
        );
      } catch (error) {
        if (session !== sessionRef.current) return;
        console.error("Read aloud failed", error);
        stopReadingAloud();
      }
    },
    [displayedFile, readPage, speakFromCharIndex, stopReadingAloud, viewer],
  );

  const handleReadAloud = useCallback(async () => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    if (isReadingAloud) {
      stopReadingAloud();
      return;
    }

    await startReading(viewer.getScrollState().currentPage || 1);
  }, [isReadingAloud, startReading, stopReadingAloud, viewer]);

  useEffect(() => {
    const handleReadFromSelection = (event: Event) => {
      const { pageNumber, selectedText, approximatePosition } = (
        event as CustomEvent<ReadAloudFromSelectionDetail>
      ).detail;
      stopReadingAloud();
      void startReading(pageNumber, (spokenText) =>
        findReadAloudStartIndex(spokenText, selectedText, approximatePosition),
      );
    };
    window.addEventListener(
      READ_ALOUD_FROM_SELECTION_EVENT,
      handleReadFromSelection,
    );
    return () =>
      window.removeEventListener(
        READ_ALOUD_FROM_SELECTION_EVENT,
        handleReadFromSelection,
      );
  }, [startReading, stopReadingAloud]);

  const handleSpeechRateChange = useCallback(
    (nextRate: number) => {
      setSpeechRate(nextRate);

      if (
        !isReadingAloud ||
        !utteranceRef.current ||
        !speechTextRef.current ||
        typeof window === "undefined" ||
        !window.speechSynthesis
      ) {
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
          currentPageNumberRef.current,
          nextRate,
          speechLanguageRef.current,
        );
      }, 80);
    },
    [isReadingAloud, speakFromCharIndex, viewer],
  );

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

  useEffect(() => stopReadingAloud, [stopReadingAloud]);

  const handleSpeechLanguageChange = useCallback(
    (nextLanguage: string) => {
      setSpeechLanguage(nextLanguage);
      speechLanguageRef.current = nextLanguage;
      const voice = findVoiceForLanguage(nextLanguage);
      setSpeechVoice(voice);

      if (
        !isReadingAloud ||
        !utteranceRef.current ||
        !speechTextRef.current ||
        typeof window === "undefined" ||
        !window.speechSynthesis
      ) {
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
          currentPageNumberRef.current,
          speechRateRef.current,
          nextLanguage,
        );
      }, 80);
    },
    [isReadingAloud, speakFromCharIndex],
  );

  return {
    isReadingAloud,
    speechRate,
    speechLanguage,
    speechVoice,
    supportedLanguageCodes,
    handleReadAloud,
    handleSpeechRateChange,
    handleSpeechLanguageChange,
  };
}
