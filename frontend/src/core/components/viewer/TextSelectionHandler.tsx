import { useEffect, useRef } from 'react';
import { useSelectionPlugin, useSelectionCapability, glyphAt } from '@embedpdf/plugin-selection/react';
import { useInteractionManagerCapability } from '@embedpdf/plugin-interaction-manager/react';
import type { Position, PdfPageGeometry, PdfRun } from '@embedpdf/models';

interface TextSelectionHandlerProps {
  documentId: string;
  pageIndex: number;
}

// Time threshold for triple-click detection (ms)
const TRIPLE_CLICK_TIME_THRESHOLD = 500;
// Distance threshold for triple-click position matching (in page units)
const TRIPLE_CLICK_POSITION_THRESHOLD = 20;

/**
 * Regex matching Unicode word characters (letters, digits, connector punctuation).
 * Used for word boundary detection on double-click.
 */
const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u;

/**
 * Finds the run containing the given glyph index.
 */
function findRunForGlyph(geo: PdfPageGeometry, glyphIndex: number): PdfRun | null {
  for (const run of geo.runs) {
    const runEnd = run.charStart + run.glyphs.length - 1;
    if (glyphIndex >= run.charStart && glyphIndex <= runEnd) {
      return run;
    }
  }
  return null;
}

/**
 * Finds word boundaries in text content using actual character values.
 * Uses Unicode-aware word character detection for internationalization support.
 *
 * Behavior matches standard text editors / browsers:
 * - Double-click on a word character: selects the whole word (letters, digits, underscores)
 * - Double-click on punctuation: selects just that character
 * - Double-click on whitespace: no selection
 */
function findWordBoundariesInText(text: string, charIndex: number): { start: number; end: number } | null {
  if (charIndex < 0 || charIndex >= text.length) return null;

  const char = text[charIndex];

  // If clicked on whitespace, don't select
  if (/\s/.test(char)) return null;

  // If clicked on a word character (Unicode letter, digit, underscore), select the word
  if (WORD_CHAR_REGEX.test(char)) {
    let start = charIndex;
    while (start > 0 && WORD_CHAR_REGEX.test(text[start - 1])) start--;

    let end = charIndex;
    while (end < text.length - 1 && WORD_CHAR_REGEX.test(text[end + 1])) end++;

    return { start, end };
  }

  // Clicked on punctuation or other non-word, non-space character:
  // select just that character
  return { start: charIndex, end: charIndex };
}

/**
 * Finds line boundaries around the given glyph index.
 * A "line" is defined as consecutive runs sharing a similar Y position.
 */
function findLineBoundaries(geo: PdfPageGeometry, glyphIndex: number): { start: number; end: number } | null {
  let targetRunIndex = -1;
  for (let i = 0; i < geo.runs.length; i++) {
    const run = geo.runs[i];
    const runEnd = run.charStart + run.glyphs.length - 1;
    if (glyphIndex >= run.charStart && glyphIndex <= runEnd) {
      targetRunIndex = i;
      break;
    }
  }

  if (targetRunIndex === -1) return null;

  const targetRun = geo.runs[targetRunIndex];
  const targetY = targetRun.rect.y;
  const targetH = targetRun.rect.height;
  const threshold = targetH * 0.5;

  // Expand backwards to find the first run on the same visual line
  let firstRunIndex = targetRunIndex;
  while (firstRunIndex > 0) {
    const prevRun = geo.runs[firstRunIndex - 1];
    if (Math.abs(prevRun.rect.y - targetY) < threshold) {
      firstRunIndex--;
    } else {
      break;
    }
  }

  // Expand forwards to find the last run on the same visual line
  let lastRunIndex = targetRunIndex;
  while (lastRunIndex < geo.runs.length - 1) {
    const nextRun = geo.runs[lastRunIndex + 1];
    if (Math.abs(nextRun.rect.y - targetY) < threshold) {
      lastRunIndex++;
    } else {
      break;
    }
  }

  const firstRun = geo.runs[firstRunIndex];
  const lastRun = geo.runs[lastRunIndex];

  return {
    start: firstRun.charStart,
    end: lastRun.charStart + lastRun.glyphs.length - 1,
  };
}

/**
 * Sets selection on the plugin by calling its internal methods.
 * These methods are private in TypeScript but accessible at runtime.
 */
function setSelectionRange(
  selPlugin: any,
  documentId: string,
  pageIndex: number,
  startIndex: number,
  endIndex: number
): void {
  selPlugin.clearSelection(documentId);
  selPlugin.beginSelection(documentId, pageIndex, startIndex);
  selPlugin.updateSelection(documentId, pageIndex, endIndex);
  selPlugin.endSelection(documentId);
}

/**
 * Handles text selection with standard PDF viewer behaviors:
 * - Double-click to select a whole word
 * - Triple-click to select an entire line
 *
 * This component renders nothing and purely registers interaction handlers.
 * It must be rendered per-page alongside SelectionLayer.
 */
export function TextSelectionHandler({ documentId, pageIndex }: TextSelectionHandlerProps) {
  const { plugin: selPlugin } = useSelectionPlugin();
  const { provides: selCapability } = useSelectionCapability();
  const { provides: imCapability } = useInteractionManagerCapability();

  // Track double-click for triple-click detection
  const lastDblClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // Track triple-click time to skip subsequent dblclick events in the same sequence
  const tripleClickTimeRef = useRef(0);

  useEffect(() => {
    if (!selPlugin || !selCapability || !imCapability) return;

    const handlers = {
      onDoubleClick: (pos: Position, _evt: any, modeId: string) => {
        // Skip if this dblclick is part of a triple-click sequence
        if (Date.now() - tripleClickTimeRef.current < TRIPLE_CLICK_TIME_THRESHOLD) {
          return;
        }

        // Only handle when text selection is enabled for the current mode
        if (!selCapability.isEnabledForMode(modeId, documentId)) return;

        const state = selCapability.getState(documentId);
        const geo = state.geometry[pageIndex];
        if (!geo) return;

        const g = glyphAt(geo, pos);
        if (g === -1) return;

        // Find the run containing the glyph
        const run = findRunForGlyph(geo, g);
        if (!run || run.glyphs.length === 0) return;

        const localIndex = g - run.charStart;

        // Get the actual text content from the engine to find real word boundaries
        const plugin = selPlugin as any;
        try {
          const coreDoc = plugin.getCoreDocument(documentId);
          if (!coreDoc?.document) return;

          const task = plugin.engine.getTextSlices(coreDoc.document, [{
            pageIndex,
            charIndex: run.charStart,
            charCount: run.glyphs.length,
          }]);

          task.wait((texts: string[]) => {
            const text = texts[0];
            if (!text) return;

            const boundaries = findWordBoundariesInText(text, localIndex);
            if (!boundaries) return;

            // Record for triple-click detection
            lastDblClickRef.current = { time: Date.now(), x: pos.x, y: pos.y };

            // Select the whole word
            setSelectionRange(
              selPlugin, documentId, pageIndex,
              run.charStart + boundaries.start,
              run.charStart + boundaries.end
            );
          }, () => { /* ignore errors */ });
        } catch {
          // Engine access failed - silently ignore
        }
      },

      onClick: (pos: Position, _evt: any, modeId: string) => {
        // Check for triple-click: a click shortly after a double-click at a similar position
        const dbl = lastDblClickRef.current;
        if (!dbl) return;

        if (!selCapability.isEnabledForMode(modeId, documentId)) return;

        const now = Date.now();
        const timeDiff = now - dbl.time;
        const dx = Math.abs(pos.x - dbl.x);
        const dy = Math.abs(pos.y - dbl.y);

        if (
          timeDiff < TRIPLE_CLICK_TIME_THRESHOLD &&
          dx < TRIPLE_CLICK_POSITION_THRESHOLD &&
          dy < TRIPLE_CLICK_POSITION_THRESHOLD
        ) {
          const state = selCapability.getState(documentId);
          const geo = state.geometry[pageIndex];
          if (!geo) return;

          const g = glyphAt(geo, pos);
          if (g === -1) return;

          const line = findLineBoundaries(geo, g);
          if (!line) return;

          // Mark triple-click time to skip subsequent dblclick in this sequence
          tripleClickTimeRef.current = now;
          lastDblClickRef.current = null;

          // Select the whole line
          setSelectionRange(selPlugin, documentId, pageIndex, line.start, line.end);
        }
      },
    };

    return imCapability.registerAlways({
      scope: { type: 'page', documentId, pageIndex },
      handlers,
    });
  }, [selPlugin, selCapability, imCapability, documentId, pageIndex]);

  return null;
}
