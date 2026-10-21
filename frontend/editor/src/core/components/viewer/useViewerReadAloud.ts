import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { computeReadAloudHighlightRect } from "@app/components/viewer/readAloudHighlight";
import {
  READ_ALOUD_FROM_SELECTION_EVENT,
  findReadAloudStartIndex,
  type ReadAloudFromSelectionDetail,
} from "@app/components/viewer/readAloudFromSelection";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useStopReadAloudOnNavigation } from "@app/components/viewer/useStopReadAloudOnNavigation";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import {
  detectDocumentLanguage,
  sampleTextForDetection,
  type DocumentLanguage,
} from "@app/services/languageDetection/documentLanguage";
import {
  chunkIndexForChar,
  chunkTextForSpeech,
  wordIndexAtChar,
  type SpeechChunk,
} from "@app/services/readAloud/chunkText";
import {
  baseLanguage,
  groupVoicesByLanguage,
  isSpeechSynthesisSupported,
  languageDisplayName,
  resolveVoiceForLanguage,
  voiceDisplayName,
  voiceMatchesLanguage,
  voicesForLanguage,
  type ReadAloudLanguageOption,
} from "@app/services/readAloud/voices";
import { StirlingFile } from "@app/types/fileContext";
import { ZINDEX } from "@app/constants/zIndex";
import "@app/components/viewer/readAloud/readAloudHighlight.css";

type PdfDocument = Awaited<ReturnType<typeof pdfWorkerManager.createDocument>>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

interface TextItemWithGeometry {
  str: string;
  transform: number[];
  width: number;
  height: number;
  viewportTransform: number[];
}

interface ReadAloudPage {
  page: PdfPage;
  text: string;
  words: string[];
  chunks: SpeechChunk[];
  items: TextItemWithGeometry[];
}

export type ReadAloudPlayback = "idle" | "playing" | "paused" | "finished";
export type ReadAloudDetectionStatus = "idle" | "detecting" | "ready" | "error";
export type ReadAloudLanguageSource = "detected" | "manual" | "fallback";
export type ReadAloudError =
  | "noSpeech"
  | "noVoice"
  | "noText"
  | "detectionFailed"
  | "playbackFailed"
  | null;

export interface ReadAloudStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ViewerReadAloudState;
}

export interface ViewerReadAloudState {
  /** Stable subscription handle so toolbar buttons do not re-register on every state change. */
  store: ReadAloudStore;
  isReadingAloud: boolean;
  isPaused: boolean;
  playback: ReadAloudPlayback;
  panelOpen: boolean;
  detection: DocumentLanguage | null;
  detectionStatus: ReadAloudDetectionStatus;
  language: string;
  languageSource: ReadAloudLanguageSource;
  voice: SpeechSynthesisVoice | null;
  selectedVoiceURI: string;
  voices: SpeechSynthesisVoice[];
  languageOptions: ReadAloudLanguageOption[];
  voiceOptions: SpeechSynthesisVoice[];
  voiceLabel: string;
  speechRate: number;
  highlightEnabled: boolean;
  currentPage: number;
  totalPages: number;
  chunkIndex: number;
  chunkCount: number;
  error: ReadAloudError;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  togglePlayPause: () => Promise<void>;
  stop: () => void;
  previous: () => void;
  next: () => void;
  setRate: (rate: number, commit?: boolean) => void;
  setVoice: (voiceURI: string) => void;
  setLanguage: (code: string) => void;
  setHighlightEnabled: (enabled: boolean) => void;
  redetect: () => Promise<void>;
}

const MIN_RATE = 0.5;
const MAX_RATE = 2;
const PAGE_CACHE_LIMIT = 4;
const IDLE_DOC_CLEANUP_MS = 20_000;

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
  highlight.className = "read-aloud-highlight";
  highlight.style.left = `${highlightRect.left}px`;
  highlight.style.top = `${highlightRect.top}px`;
  highlight.style.width = `${highlightRect.width}px`;
  highlight.style.height = `${highlightRect.height}px`;
  highlight.style.zIndex = String(ZINDEX.VIEWER_HIGHLIGHT);
  pageEl.appendChild(highlight);

  return highlight;
}

function fileKey(file: StirlingFile | File): string {
  const id = (file as StirlingFile).fileId;
  return `${id ?? file.name}:${file.size}:${file.lastModified ?? 0}`;
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/**
 * Read-aloud state and playback for the viewer.
 *
 * The browser's speech queue speaks a whole page badly: Chrome drops long
 * utterances and pause/resume is broken on Android. This hook therefore owns a
 * sentence-sized queue, a cursor into it, and a session token so a cancelled
 * page can never speak over the one that replaced it.
 *
 * `displayedFile` is the file the viewer is showing, preview included, so the
 * controls and the selection menu always speak the same document.
 */
export function useViewerReadAloud(
  defaultLanguage?: string,
  displayedFile?: StirlingFile | File | null,
): ViewerReadAloudState {
  const viewer = useViewer();
  const { preferences, updatePreference } = usePreferences();
  const fallbackLanguage = defaultLanguage || "en-US";

  const [panelOpen, setPanelOpen] = useState(false);
  const [playback, setPlayback] = useState<ReadAloudPlayback>("idle");
  const [detection, setDetection] = useState<DocumentLanguage | null>(null);
  const [detectionStatus, setDetectionStatus] =
    useState<ReadAloudDetectionStatus>("idle");
  const [language, setLanguageState] = useState(baseLanguage(fallbackLanguage));
  const [languageSource, setLanguageSource] =
    useState<ReadAloudLanguageSource>("fallback");
  const [voiceURI, setVoiceURI] = useState(preferences.readAloudVoiceURI || "");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speechRate, setSpeechRateState] = useState(() =>
    clampRate(preferences.readAloudRate),
  );
  const [highlightEnabled, setHighlightEnabledState] = useState(
    preferences.readAloudHighlight !== false,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<ReadAloudError>(null);

  const fileRef = useRef<StirlingFile | File | null>(displayedFile ?? null);
  const docRef = useRef<PdfDocument | null>(null);
  const docFileKeyRef = useRef<string | null>(null);
  const docPromiseRef = useRef<Promise<PdfDocument> | null>(null);
  const docTokenRef = useRef(0);
  const pageCacheRef = useRef<Map<number, ReadAloudPage>>(new Map());
  const detectionCacheRef = useRef<Map<string, DocumentLanguage>>(new Map());
  const detectionPromiseRef = useRef<{
    key: string;
    promise: Promise<DocumentLanguage | null>;
  } | null>(null);
  const detectionTokenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const chunksRef = useRef<SpeechChunk[]>([]);
  const pageWordsRef = useRef<string[]>([]);
  const pageTextRef = useRef("");
  const textItemsRef = useRef<TextItemWithGeometry[]>([]);
  const highlightedElementsRef = useRef<HTMLElement[]>([]);
  const currentPageRef = useRef(1);
  const totalPagesRef = useRef(0);
  const chunkCountRef = useRef(0);
  const lastWordIndexRef = useRef(-1);
  const playbackRef = useRef({ page: 1, chunk: 0, offset: 0 });
  const playbackStateRef = useRef<ReadAloudPlayback>("idle");
  const speechRateRef = useRef(speechRate);
  const languageRef = useRef(language);
  const languageSourceRef = useRef(languageSource);
  const voiceURIRef = useRef(voiceURI);
  const preferredVoiceURIRef = useRef(preferences.readAloudVoiceURI || "");
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const highlightEnabledRef = useRef(highlightEnabled);
  const previousDisplayedFileRef = useRef(displayedFile ?? null);
  const advancePageRef = useRef<(session: number) => void>(() => {});
  const speakChunkRef = useRef<
    (chunk: number, offset: number, session: number) => void
  >(() => {});
  const listenersRef = useRef(new Set<() => void>());
  const snapshotRef = useRef<ViewerReadAloudState | null>(null);
  const lastStateKeyRef = useRef("");

  const clearHighlights = useCallback(() => {
    highlightedElementsRef.current.forEach((el) => el.remove());
    highlightedElementsRef.current = [];
  }, []);

  const disposeDocument = useCallback(() => {
    docTokenRef.current++;
    if (docRef.current) {
      pdfWorkerManager.destroyDocument(docRef.current);
      docRef.current = null;
    }
    docFileKeyRef.current = null;
    docPromiseRef.current = null;
    pageCacheRef.current.clear();
  }, []);

  const getDocument = useCallback(
    async (file: StirlingFile | File): Promise<PdfDocument> => {
      const key = fileKey(file);
      if (docRef.current && docFileKeyRef.current === key) {
        return docRef.current;
      }
      if (docPromiseRef.current) return docPromiseRef.current;

      disposeDocument();
      const token = docTokenRef.current;
      const promise = (async () => {
        const created = await pdfWorkerManager.createDocument(
          await file.arrayBuffer(),
        );
        if (token !== docTokenRef.current) {
          pdfWorkerManager.destroyDocument(created);
          throw new Error("Read aloud document was superseded");
        }
        docRef.current = created;
        docFileKeyRef.current = key;
        return created;
      })();
      docPromiseRef.current = promise;
      try {
        return await promise;
      } catch (cause) {
        docPromiseRef.current = null;
        throw cause;
      }
    },
    [disposeDocument],
  );

  const extractPage = useCallback(
    async (
      doc: PdfDocument,
      pageNumber: number,
      zoom: number,
    ): Promise<ReadAloudPage> => {
      const cached = pageCacheRef.current.get(pageNumber);
      if (cached) return cached;

      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const viewportTransform = page.getViewport({ scale: zoom }).transform;

      const textItems: TextItemWithGeometry[] = [];
      for (const item of textContent.items) {
        if (!isTextItem(item)) continue;
        textItems.push({ ...item, viewportTransform });
      }

      // Sort by visual position so speech follows the reading order instead of
      // the PDF's internal content-stream order.
      const sortedItems = [...textItems].sort((a, b) => {
        const yA = a.transform[5] ?? 0;
        const yB = b.transform[5] ?? 0;
        const xA = a.transform[4] ?? 0;
        const xB = b.transform[4] ?? 0;
        if (Math.abs(yA - yB) > 5) return yB - yA;
        return xA - xB;
      });

      // Merge characters and syllables that the producer emitted as separate
      // items; otherwise a word can be spoken as a string of letters.
      const mergedItems: TextItemWithGeometry[] = [];
      const CHAR_MERGE_THRESHOLD = 5;
      for (const item of sortedItems) {
        const itemText = item.str;
        if (itemText.trim() === "") {
          mergedItems.push(item);
          continue;
        }
        const lastItem = mergedItems[mergedItems.length - 1];
        if (lastItem && lastItem.str.trim()) {
          const yDiff = Math.abs(
            (lastItem.transform[5] ?? 0) - (item.transform[5] ?? 0),
          );
          const xGap =
            (item.transform[4] ?? 0) -
            ((lastItem.transform[4] ?? 0) + (lastItem.width ?? 0));
          if (yDiff < 5 && xGap < CHAR_MERGE_THRESHOLD) {
            lastItem.str += itemText;
            lastItem.width =
              (lastItem.width ?? 0) + Math.max(0, xGap) + (item.width ?? 0);
            continue;
          }
        }
        mergedItems.push({ ...item, str: itemText });
      }

      const text = mergedItems
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const data: ReadAloudPage = {
        page,
        text,
        words: text.split(/\s+/).filter(Boolean),
        chunks: chunkTextForSpeech(text),
        items: mergedItems,
      };

      pageCacheRef.current.set(pageNumber, data);
      if (pageCacheRef.current.size > PAGE_CACHE_LIMIT) {
        for (const key of pageCacheRef.current.keys()) {
          if (key !== pageNumber && key !== currentPageRef.current) {
            pageCacheRef.current.delete(key);
            break;
          }
        }
      }
      return data;
    },
    [],
  );

  const loadPage = useCallback(
    async (
      file: StirlingFile | File,
      pageNumber: number,
      session: number,
    ): Promise<ReadAloudPage | null> => {
      const doc = await getDocument(file);
      if (session !== sessionRef.current) return null;
      const zoom = (viewer.getZoomState().zoomPercent || 100) / 100;
      const data = await extractPage(doc, pageNumber, zoom);
      if (session !== sessionRef.current) return null;
      return data;
    },
    [extractPage, getDocument, viewer],
  );

  const applyDetection = useCallback(
    (result: DocumentLanguage) => {
      setDetection(result);
      if (languageSourceRef.current === "manual") return;

      const detected = result.detection.language;
      if (detected == null) {
        const fallback = baseLanguage(fallbackLanguage);
        const fallbackVoice = resolveVoiceForLanguage(
          fallback,
          voicesRef.current,
          preferredVoiceURIRef.current,
          fallbackLanguage,
        );
        setLanguageState(fallback);
        languageRef.current = fallback;
        setLanguageSource("fallback");
        languageSourceRef.current = "fallback";
        setVoiceURI(fallbackVoice?.voiceURI ?? "");
        voiceURIRef.current = fallbackVoice?.voiceURI ?? "";
        return;
      }

      const resolved = resolveVoiceForLanguage(
        detected,
        voicesRef.current,
        preferredVoiceURIRef.current,
        fallbackLanguage,
      );
      setLanguageState(detected);
      languageRef.current = detected;
      setLanguageSource("detected");
      languageSourceRef.current = "detected";
      setVoiceURI(resolved?.voiceURI ?? "");
      voiceURIRef.current = resolved?.voiceURI ?? "";
    },
    [fallbackLanguage],
  );

  const detect = useCallback(
    async (file: StirlingFile | File): Promise<DocumentLanguage | null> => {
      const key = fileKey(file);
      const cached = detectionCacheRef.current.get(key);
      if (cached) {
        applyDetection(cached);
        setDetectionStatus("ready");
        return cached;
      }
      if (detectionPromiseRef.current?.key === key) {
        return detectionPromiseRef.current.promise;
      }

      const token = ++detectionTokenRef.current;
      setDetectionStatus("detecting");
      let failed = false;
      const promise = (async (): Promise<DocumentLanguage | null> => {
        try {
          const doc = await getDocument(file);
          if (token !== detectionTokenRef.current) return null;

          let metadataTag: unknown;
          try {
            const metadata = await doc.getMetadata();
            metadataTag = (metadata.info as Record<string, unknown> | undefined)
              ?.Language;
          } catch {
            // Metadata is optional; text detection still works without it.
          }

          const pages: string[] = [];
          const pageCount = Math.max(doc.numPages || 1, 1);
          const pageNumbers = Array.from(
            new Set([
              1,
              Math.min(2, pageCount),
              Math.min(currentPageRef.current || 1, pageCount),
            ]),
          );
          for (const pageNumber of pageNumbers) {
            const zoom = (viewer.getZoomState().zoomPercent || 100) / 100;
            const pageData = await extractPage(doc, pageNumber, zoom);
            if (token !== detectionTokenRef.current) return null;
            if (pageData.text.length > 0) pages.push(pageData.text);
            if (pages.join("").length >= 5_000) break;
          }

          const result = detectDocumentLanguage(
            sampleTextForDetection(pages),
            metadataTag,
          );
          detectionCacheRef.current.set(key, result);
          return result;
        } catch (cause) {
          console.error("Read aloud language detection failed", cause);
          failed = true;
          if (token === detectionTokenRef.current) {
            setError("detectionFailed");
          }
          return null;
        }
      })();

      detectionPromiseRef.current = { key, promise };
      const result = await promise;
      if (detectionPromiseRef.current?.promise === promise) {
        detectionPromiseRef.current = null;
      }
      if (token !== detectionTokenRef.current) return null;
      setDetectionStatus(failed ? "error" : "ready");
      if (result) applyDetection(result);
      return result;
    },
    [applyDetection, extractPage, getDocument, viewer],
  );

  const ensureDetection =
    useCallback(async (): Promise<DocumentLanguage | null> => {
      const file = fileRef.current ?? displayedFile ?? null;
      if (!file) return null;
      return detect(file);
    }, [detect, displayedFile]);

  const highlightWord = useCallback(
    (wordIndex: number, words: string[], pageNumber: number) => {
      clearHighlights();
      if (!highlightEnabledRef.current) return;
      if (wordIndex < 0 || wordIndex >= words.length) return;

      const wordToFind = words[wordIndex];
      if (!wordToFind) return;

      try {
        let currentWordCount = 0;
        const pageEl = document.querySelector(
          `[data-page-index="${pageNumber - 1}"]`,
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
              if (highlight) highlightedElementsRef.current.push(highlight);
              return;
            }
            currentWordCount++;
          }
        }
      } catch {
        // Highlighting is best-effort; speech must not fail with it.
      }
    },
    [clearHighlights],
  );

  const refreshActiveHighlight = useCallback(() => {
    if (
      playbackStateRef.current !== "playing" &&
      playbackStateRef.current !== "paused"
    ) {
      return;
    }
    const pageData = pageCacheRef.current.get(currentPageRef.current);
    if (pageData) {
      const zoom = (viewer.getZoomState().zoomPercent || 100) / 100;
      const transform = pageData.page.getViewport({ scale: zoom }).transform;
      for (const item of pageData.items) item.viewportTransform = transform;
      textItemsRef.current = pageData.items;
    }
    highlightWord(
      lastWordIndexRef.current,
      pageWordsRef.current,
      currentPageRef.current,
    );
  }, [highlightWord, viewer]);

  const finishPlayback = useCallback(() => {
    utteranceRef.current = null;
    setPlayback("finished");
    playbackStateRef.current = "finished";
    setChunkIndex(chunkCountRef.current);
    lastWordIndexRef.current = -1;
    clearHighlights();
  }, [clearHighlights]);

  const speakChunk = useCallback(
    (index: number, offset: number, session: number) => {
      if (!isSpeechSynthesisSupported() || session !== sessionRef.current) {
        return;
      }
      const chunks = chunksRef.current;
      if (index >= chunks.length) {
        advancePageRef.current(session);
        return;
      }

      const chunk = chunks[index];
      const clampedOffset = Math.max(0, Math.min(offset, chunk.text.length));
      const raw = chunk.text.slice(clampedOffset);
      const remaining = raw.trimStart();
      const trimmedDelta = raw.length - remaining.length;
      if (remaining.length === 0) {
        speakChunkRef.current(index + 1, 0, session);
        return;
      }

      const baseChar = chunk.startChar + clampedOffset + trimmedDelta;
      playbackRef.current = {
        page: currentPageRef.current,
        chunk: index,
        offset: clampedOffset + trimmedDelta,
      };
      const utterance = new SpeechSynthesisUtterance(remaining);
      utterance.rate = speechRateRef.current;
      const selectedVoice = voiceURIRef.current
        ? (voicesRef.current.find(
            (voice) => voice.voiceURI === voiceURIRef.current,
          ) ?? null)
        : null;
      const voice =
        selectedVoice &&
        voiceMatchesLanguage(selectedVoice, languageRef.current)
          ? selectedVoice
          : resolveVoiceForLanguage(
              languageRef.current,
              voicesRef.current,
              preferredVoiceURIRef.current,
              fallbackLanguage,
            );
      utterance.voice = voice;
      utterance.lang = voice?.lang ?? languageRef.current;
      if (voice) {
        setVoiceURI(voice.voiceURI);
        voiceURIRef.current = voice.voiceURI;
      }

      utterance.onstart = () => {
        if (session !== sessionRef.current) return;
        setPlayback("playing");
        playbackStateRef.current = "playing";
      };

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (session !== sessionRef.current) return;
        if (event.name !== "word") return;
        const absoluteCharIndex = baseChar + event.charIndex;
        playbackRef.current = {
          ...playbackRef.current,
          offset: clampedOffset + trimmedDelta + event.charIndex,
        };
        const wordIndex = wordIndexAtChar(
          pageWordsRef.current,
          absoluteCharIndex,
        );
        if (wordIndex === -1) return;
        lastWordIndexRef.current = wordIndex;
        highlightWord(wordIndex, pageWordsRef.current, currentPageRef.current);
      };

      utterance.onend = () => {
        if (session !== sessionRef.current) return;
        utteranceRef.current = null;
        playbackRef.current = {
          ...playbackRef.current,
          chunk: index,
          offset: 0,
        };
        speakChunkRef.current(index + 1, 0, session);
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (session !== sessionRef.current) return;
        utteranceRef.current = null;
        if (event.error === "interrupted" || event.error === "canceled") {
          return;
        }
        setError("playbackFailed");
        setPlayback("idle");
        playbackStateRef.current = "idle";
        clearHighlights();
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    [clearHighlights, fallbackLanguage, highlightWord],
  );

  const advancePage = useCallback(
    (session: number) => {
      if (session !== sessionRef.current) return;
      const page = currentPageRef.current;
      if (page >= totalPagesRef.current) {
        finishPlayback();
        return;
      }

      const next = page + 1;
      const file = fileRef.current;
      if (!file) {
        finishPlayback();
        return;
      }

      currentPageRef.current = next;
      setCurrentPage(next);
      setChunkIndex(0);
      setChunkCount(0);
      viewer.scrollActions.scrollToPage(next, "smooth");

      void (async () => {
        const data = await loadPage(file, next, session);
        if (session !== sessionRef.current) return;
        if (!data || data.chunks.length === 0) {
          advancePageRef.current(session);
          return;
        }
        chunksRef.current = data.chunks;
        pageWordsRef.current = data.words;
        pageTextRef.current = data.text;
        textItemsRef.current = data.items;
        chunkCountRef.current = data.chunks.length;
        setChunkCount(data.chunks.length);
        lastWordIndexRef.current = -1;
        playbackRef.current = { page: next, chunk: 0, offset: 0 };
        speakChunkRef.current(0, 0, session);
      })();
    },
    [finishPlayback, loadPage, viewer.scrollActions],
  );

  advancePageRef.current = advancePage;
  speakChunkRef.current = speakChunk;

  const startPlayback = useCallback(
    async (
      pageNumber: number,
      options?: {
        startChar?: number;
        selection?: ReadAloudFromSelectionDetail;
      },
    ) => {
      const file = fileRef.current ?? displayedFile ?? null;
      if (!file) return;
      if (!isSpeechSynthesisSupported()) {
        setError("noSpeech");
        return;
      }

      const resolvedVoice =
        resolveVoiceForLanguage(
          languageRef.current,
          voicesRef.current,
          preferredVoiceURIRef.current,
          fallbackLanguage,
        ) ??
        (voiceURIRef.current
          ? (voicesRef.current.find(
              (voice) => voice.voiceURI === voiceURIRef.current,
            ) ?? null)
          : null);
      if (!resolvedVoice) {
        setError("noVoice");
        return;
      }

      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      setError(null);
      setPlayback("playing");
      playbackStateRef.current = "playing";

      const data = await loadPage(file, pageNumber, session);
      if (session !== sessionRef.current) return;
      if (!data || data.chunks.length === 0) {
        setPlayback("idle");
        playbackStateRef.current = "idle";
        setError("noText");
        return;
      }

      const doc = docRef.current;
      const pages = Math.max(
        doc?.numPages ?? 0,
        viewer.getScrollState().totalPages || 0,
        pageNumber,
      );
      totalPagesRef.current = pages;
      setTotalPages(pages);
      currentPageRef.current = pageNumber;
      setCurrentPage(pageNumber);

      chunksRef.current = data.chunks;
      pageWordsRef.current = data.words;
      pageTextRef.current = data.text;
      textItemsRef.current = data.items;
      chunkCountRef.current = data.chunks.length;
      setChunkCount(data.chunks.length);
      lastWordIndexRef.current = -1;

      const startChar =
        options?.startChar ??
        (options?.selection
          ? findReadAloudStartIndex(
              data.text,
              options.selection.selectedText,
              options.selection.approximatePosition,
            )
          : 0);
      const chunk = chunkIndexForChar(data.chunks, startChar);
      const offset = Math.max(0, startChar - data.chunks[chunk].startChar);
      playbackRef.current = { page: pageNumber, chunk, offset };
      setChunkIndex(chunk);
      speakChunkRef.current(chunk, offset, session);
    },
    [displayedFile, fallbackLanguage, loadPage, viewer],
  );

  const stopReadingAloud = useCallback(() => {
    sessionRef.current++;
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    playbackStateRef.current = "idle";
    setPlayback("idle");
    setChunkIndex(0);
    setChunkCount(0);
    chunkCountRef.current = 0;
    chunksRef.current = [];
    lastWordIndexRef.current = -1;
    setError(null);
    clearHighlights();
    disposeDocument();
  }, [clearHighlights, disposeDocument]);

  // Stop reading when navigating away (workbench, file, or window change).
  useStopReadAloudOnNavigation(
    playback === "playing" || playback === "paused",
    stopReadingAloud,
  );

  const pauseReading = useCallback(() => {
    sessionRef.current++;
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    playbackStateRef.current = "paused";
    setPlayback("paused");
  }, []);

  const resumeReading = useCallback(() => {
    if (chunksRef.current.length === 0) {
      void startPlayback(currentPageRef.current);
      return;
    }
    const session = ++sessionRef.current;
    playbackStateRef.current = "playing";
    setPlayback("playing");
    speakChunkRef.current(
      playbackRef.current.chunk,
      playbackRef.current.offset,
      session,
    );
  }, [startPlayback]);

  const togglePlayPause = useCallback(async () => {
    if (playback === "playing") {
      pauseReading();
      return;
    }
    if (playback === "paused") {
      resumeReading();
      return;
    }
    await ensureDetection();
    await startPlayback(viewer.getScrollState().currentPage || 1);
  }, [
    ensureDetection,
    pauseReading,
    playback,
    resumeReading,
    startPlayback,
    viewer,
  ]);

  const restartFromCurrent = useCallback(() => {
    if (playbackStateRef.current !== "playing") return;
    const session = ++sessionRef.current;
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    speakChunkRef.current(
      playbackRef.current.chunk,
      playbackRef.current.offset,
      session,
    );
  }, []);

  const setRate = useCallback(
    (rate: number, commit = false) => {
      const next = clampRate(rate);
      setSpeechRateState(next);
      speechRateRef.current = next;
      if (commit) {
        updatePreference("readAloudRate", next);
        restartFromCurrent();
      }
    },
    [restartFromCurrent, updatePreference],
  );

  const setVoice = useCallback(
    (nextVoiceURI: string) => {
      const selected = voicesRef.current.find(
        (voice) => voice.voiceURI === nextVoiceURI,
      );
      if (!selected) return;
      setVoiceURI(selected.voiceURI);
      voiceURIRef.current = selected.voiceURI;
      preferredVoiceURIRef.current = selected.voiceURI;
      updatePreference("readAloudVoiceURI", selected.voiceURI);
      const nextLanguage = baseLanguage(selected.lang);
      setLanguageState(nextLanguage);
      languageRef.current = nextLanguage;
      setLanguageSource("manual");
      languageSourceRef.current = "manual";
      restartFromCurrent();
    },
    [restartFromCurrent, updatePreference],
  );

  const setLanguage = useCallback(
    (code: string) => {
      const nextLanguage = baseLanguage(code);
      const resolved = resolveVoiceForLanguage(
        nextLanguage,
        voicesRef.current,
        undefined,
        fallbackLanguage,
      );
      setLanguageState(nextLanguage);
      languageRef.current = nextLanguage;
      setLanguageSource("manual");
      languageSourceRef.current = "manual";
      setVoiceURI(resolved?.voiceURI ?? "");
      voiceURIRef.current = resolved?.voiceURI ?? "";
      preferredVoiceURIRef.current = resolved?.voiceURI ?? "";
      if (resolved) {
        updatePreference("readAloudVoiceURI", resolved.voiceURI);
      }
      if (!resolved && playbackStateRef.current !== "idle") {
        pauseReading();
        setError("noVoice");
        return;
      }
      restartFromCurrent();
    },
    [fallbackLanguage, pauseReading, restartFromCurrent, updatePreference],
  );

  const setHighlightEnabled = useCallback(
    (enabled: boolean) => {
      setHighlightEnabledState(enabled);
      highlightEnabledRef.current = enabled;
      updatePreference("readAloudHighlight", enabled);
      if (!enabled) clearHighlights();
      else refreshActiveHighlight();
    },
    [clearHighlights, refreshActiveHighlight, updatePreference],
  );

  const redetect = useCallback(async () => {
    const file = fileRef.current ?? displayedFile ?? null;
    if (!file) return;
    detectionCacheRef.current.delete(fileKey(file));
    detectionPromiseRef.current = null;
    detectionTokenRef.current++;
    setDetectionStatus("idle");
    setError(null);
    await detect(file);
  }, [detect, displayedFile]);

  const stop = useCallback(() => {
    stopReadingAloud();
  }, [stopReadingAloud]);

  const previous = useCallback(() => {
    if (
      playbackStateRef.current !== "playing" &&
      playbackStateRef.current !== "paused"
    ) {
      return;
    }
    const chunk = playbackRef.current.chunk;
    if (chunk > 0) {
      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();
      playbackRef.current = {
        ...playbackRef.current,
        chunk: chunk - 1,
        offset: 0,
      };
      setChunkIndex(chunk - 1);
      if (playbackStateRef.current === "playing") {
        speakChunkRef.current(chunk - 1, 0, session);
      }
      return;
    }
    if (currentPageRef.current > 1) {
      void startPlayback(currentPageRef.current - 1);
    }
  }, [startPlayback]);

  const next = useCallback(() => {
    if (
      playbackStateRef.current !== "playing" &&
      playbackStateRef.current !== "paused"
    ) {
      return;
    }
    const chunk = playbackRef.current.chunk;
    if (chunk + 1 < chunksRef.current.length) {
      const session = ++sessionRef.current;
      window.speechSynthesis.cancel();
      playbackRef.current = {
        ...playbackRef.current,
        chunk: chunk + 1,
        offset: 0,
      };
      setChunkIndex(chunk + 1);
      if (playbackStateRef.current === "playing") {
        speakChunkRef.current(chunk + 1, 0, session);
      }
      return;
    }
    if (currentPageRef.current < totalPagesRef.current) {
      void startPlayback(currentPageRef.current + 1);
    }
  }, [startPlayback]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    const page = viewer.getScrollState().currentPage || 1;
    if (playbackStateRef.current === "idle") {
      currentPageRef.current = page;
      setCurrentPage(page);
    }
    setTotalPages(
      (current) => current || viewer.getScrollState().totalPages || 0,
    );
    void ensureDetection();
  }, [ensureDetection, viewer]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    if (
      playbackStateRef.current === "idle" ||
      playbackStateRef.current === "finished"
    ) {
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
      }
      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null;
        if (
          playbackStateRef.current === "idle" ||
          playbackStateRef.current === "finished"
        ) {
          disposeDocument();
        }
      }, IDLE_DOC_CLEANUP_MS);
    }
  }, [disposeDocument]);

  const togglePanel = useCallback(() => {
    if (panelOpen) closePanel();
    else openPanel();
  }, [closePanel, openPanel, panelOpen]);

  useEffect(() => {
    voicesRef.current = voices;
  }, [voices]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  useEffect(() => {
    languageRef.current = language;
    languageSourceRef.current = languageSource;
  }, [language, languageSource]);

  useEffect(() => {
    voiceURIRef.current = voiceURI;
  }, [voiceURI]);

  useEffect(() => {
    highlightEnabledRef.current = highlightEnabled;
  }, [highlightEnabled]);

  useEffect(() => {
    playbackStateRef.current = playback;
  }, [playback]);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const synth = window.speechSynthesis;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, []);

  const voice = useMemo(() => {
    const selected = voices.find((item) => item.voiceURI === voiceURI);
    if (selected && voiceMatchesLanguage(selected, language)) return selected;
    return resolveVoiceForLanguage(
      language,
      voices,
      preferredVoiceURIRef.current,
      fallbackLanguage,
    );
  }, [fallbackLanguage, language, voiceURI, voices]);

  useEffect(() => {
    if (voices.length === 0) return;
    if (voice) return;
    const resolved = resolveVoiceForLanguage(
      language,
      voices,
      preferredVoiceURIRef.current,
      fallbackLanguage,
    );
    if (resolved) setVoiceURI(resolved.voiceURI);
  }, [fallbackLanguage, language, voice, voices]);

  const languageOptions = useMemo(() => {
    const options = groupVoicesByLanguage(voices, fallbackLanguage);
    if (options.some((option) => option.value === language)) return options;
    return [
      {
        value: language,
        label: languageDisplayName(language, fallbackLanguage),
        voices: [],
      },
      ...options,
    ];
  }, [fallbackLanguage, language, voices]);
  const voiceOptions = useMemo(
    () => voicesForLanguage(language, voices),
    [language, voices],
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

  useEffect(() => {
    fileRef.current = displayedFile ?? null;
    if (previousDisplayedFileRef.current === displayedFile) return;
    previousDisplayedFileRef.current = displayedFile ?? null;
    detectionTokenRef.current++;
    detectionPromiseRef.current = null;
    stopReadingAloud();
    setDetection(null);
    setDetectionStatus("idle");
    setLanguageState(baseLanguage(fallbackLanguage));
    languageRef.current = baseLanguage(fallbackLanguage);
    setLanguageSource("fallback");
    languageSourceRef.current = "fallback";
    const preferred = preferences.readAloudVoiceURI || "";
    preferredVoiceURIRef.current = preferred;
    const resolved = resolveVoiceForLanguage(
      baseLanguage(fallbackLanguage),
      voicesRef.current,
      preferred,
      fallbackLanguage,
    );
    setVoiceURI(resolved?.voiceURI ?? "");
    voiceURIRef.current = resolved?.voiceURI ?? "";
    setCurrentPage(1);
    currentPageRef.current = 1;
    setChunkIndex(0);
    setChunkCount(0);
    setError(null);
    if (panelOpen) void ensureDetection();
  }, [
    displayedFile,
    ensureDetection,
    fallbackLanguage,
    panelOpen,
    preferences.readAloudVoiceURI,
    stopReadingAloud,
  ]);

  useEffect(() => {
    if (!panelOpen) return;
    setTotalPages(
      (current) => current || viewer.getScrollState().totalPages || 0,
    );
    void ensureDetection();
  }, [ensureDetection, panelOpen, viewer]);

  useEffect(() => {
    const handleReadFromSelection = (event: Event) => {
      const detail = (event as CustomEvent<ReadAloudFromSelectionDetail>)
        .detail;
      setPanelOpen(true);
      void (async () => {
        await ensureDetection();
        await startPlayback(detail.pageNumber, { selection: detail });
      })();
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
  }, [ensureDetection, startPlayback]);

  useEffect(() => {
    return () => {
      sessionRef.current++;
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
      }
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
      clearHighlights();
      disposeDocument();
    };
  }, [clearHighlights, disposeDocument]);

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);
  const getSnapshot = useCallback(
    () => snapshotRef.current as ViewerReadAloudState,
    [],
  );
  const store = useMemo<ReadAloudStore>(
    () => ({ subscribe, getSnapshot }),
    [getSnapshot, subscribe],
  );

  const state: ViewerReadAloudState = {
    store,
    isReadingAloud: playback === "playing" || playback === "paused",
    isPaused: playback === "paused",
    playback,
    panelOpen,
    detection,
    detectionStatus,
    language,
    languageSource,
    voice,
    selectedVoiceURI: voice?.voiceURI ?? "",
    voices,
    languageOptions,
    voiceOptions,
    voiceLabel: voice ? voiceDisplayName(voice) : "",
    speechRate,
    highlightEnabled,
    currentPage,
    totalPages,
    chunkIndex,
    chunkCount,
    error,
    openPanel,
    closePanel,
    togglePanel,
    togglePlayPause,
    stop,
    previous,
    next,
    setRate,
    setVoice,
    setLanguage,
    setHighlightEnabled,
    redetect,
  };

  // A new state object every render would re-register the toolbar button and
  // can feed back into the workbench bar. Publish only when something the player
  // renders actually changed, and let the button subscribe through the store.
  const stateKey = [
    panelOpen,
    playback,
    detectionStatus,
    language,
    languageSource,
    voice?.voiceURI ?? "",
    voice?.name ?? "",
    speechRate,
    highlightEnabled,
    currentPage,
    totalPages,
    chunkIndex,
    chunkCount,
    error ?? "",
    detection?.detection.language ?? "",
    detection?.detection.assumed ? "1" : "0",
    detection?.detection.lowText ? "1" : "0",
    detection?.source ?? "",
    detection?.tag ?? "",
    voices.length,
    languageOptions.length,
    voiceOptions.length,
  ].join("|");
  if (stateKey !== lastStateKeyRef.current) {
    lastStateKeyRef.current = stateKey;
    snapshotRef.current = state;
  }

  useEffect(() => {
    for (const listener of listenersRef.current) listener();
  }, [stateKey]);

  return state;
}
