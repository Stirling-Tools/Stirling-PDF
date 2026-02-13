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

const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u;

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

  if (WORD_CHAR_REGEX.test(char)) {
    let start = charIndex;
    while (start > 0 && WORD_CHAR_REGEX.test(text[start - 1])) start--;

    let end = charIndex;
    while (end < text.length - 1 && WORD_CHAR_REGEX.test(text[end + 1])) end++;

    return { start, end };
  }

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

  let firstRunIndex = targetRunIndex;
  while (firstRunIndex > 0) {
    const prevRun = geo.runs[firstRunIndex - 1];
    if (Math.abs(prevRun.rect.y - targetY) < threshold) {
      firstRunIndex--;
    } else {
      break;
    }
  }

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
 */
export function TextSelectionHandler({ documentId, pageIndex }: TextSelectionHandlerProps) {
  const { plugin: selPlugin } = useSelectionPlugin();
  const { provides: selCapability } = useSelectionCapability();
  const { provides: imCapability } = useInteractionManagerCapability();

  const lastDblClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tripleClickTimeRef = useRef(0);

  useEffect(() => {
    if (!selPlugin || !selCapability || !imCapability) return;

    const handlers = {
      onDoubleClick: (pos: Position, _evt: any, modeId: string) => {
        if (Date.now() - tripleClickTimeRef.current < TRIPLE_CLICK_TIME_THRESHOLD) {
          return;
        }

        if (!selCapability.isEnabledForMode(modeId, documentId)) return;

        const state = selCapability.getState(documentId);
        const geo = state.geometry[pageIndex];
        if (!geo) return;

        const g = glyphAt(geo, pos);
        if (g === -1) return;

        const run = findRunForGlyph(geo, g);
        if (!run || run.glyphs.length === 0) return;

        const localIndex = g - run.charStart;

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

            lastDblClickRef.current = { time: Date.now(), x: pos.x, y: pos.y };

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
