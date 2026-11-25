import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { TextInput, Tooltip } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import "@editor/tools/pdfTextEditor/components/FindBar.css";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  findMatches,
  replaceMatches,
} from "@editor/tools/pdfTextEditor/util/textMatching";
import type {
  MatchOptions,
  TextMatch,
} from "@editor/tools/pdfTextEditor/util/textMatching";
import { readAllPagesInBackground } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type { ScanFitTarget } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import { useDispatchAfterScanFit } from "@editor/tools/pdfTextEditor/hooks/useDispatchAfterScanFit";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import { revealOnPage } from "@editor/tools/pdfTextEditor/util/dom";

interface FindBarProps {
  store: EditorStore;
  pages: PageSnapshot[];
  onClose: () => void;
}

/** The toolbar control find opens from: its own button, or the compact bar's overflow menu. */
const ANCHOR =
  '[data-testid="pdf-editor-open-find"], [data-testid="pdf-editor-overflow-menu"]';
const EDGE_GAP_PX = 12;

/**
 * Inline offset that hangs the panel beneath its toolbar control, kept on
 * screen. Null when the bar has no such control (the mobile bar), leaving
 * the stylesheet's end-aligned fallback.
 */
function useAnchoredLeft(
  panelRef: RefObject<HTMLDivElement | null>,
): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const host = panel?.offsetParent;
    if (!panel || !(host instanceof HTMLElement)) return;
    // The control moves when the bar resizes or folds, when the unsaved dot
    // narrows its band, and when that band scrolls sideways.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => place());
    let band: Element | null = null;
    const place = () => {
      // Swapping between the mobile and desktop bars resizes the host and
      // remounts the band, so follow whichever band is current.
      const current = host.querySelector(".pdf-editor-topbar__band");
      if (observer && current !== band) {
        if (band) observer.unobserve(band);
        if (current) observer.observe(current);
        band = current;
      }
      const anchor = host.querySelector<HTMLElement>(ANCHOR);
      if (!anchor) {
        setLeft(null);
        return;
      }
      const h = host.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const rtl = getComputedStyle(host).direction === "rtl";
      const ideal = rtl
        ? a.right - h.left - panel.offsetWidth
        : a.left - h.left;
      const max = h.width - panel.offsetWidth - EDGE_GAP_PX;
      setLeft(Math.max(EDGE_GAP_PX, Math.min(ideal, max)));
    };
    observer?.observe(host);
    place();
    host.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      host.removeEventListener("scroll", place, true);
    };
  }, [panelRef]);
  return left;
}

interface Match {
  pageIndex: number;
  runId: string;
  /** Run snapshot (cached so navigation can scroll to it). */
  run: TextRunSnapshot;
  /** This occurrence, as offsets into `run.text`. */
  range: TextMatch;
  /** Every occurrence inside this run, so Replace all edits each run once. */
  ranges: TextMatch[];
}

/**
 * In-document find + replace. Searches every loaded TextRun snapshot
 * for the query (case, whole-word and accent handling come from the
 * toggles), tracks the current match, and scrolls / selects it.
 * Replace and Replace All rewrite the matching runs via batched
 * `EditTextCommand`s.
 *
 * Triggered from Ctrl+F in PdfTextEditor. Matches that haven't been
 * lazy-loaded yet won't show until the user scrolls past those pages
 * (the `ensurePageRead` hook will populate them on intersection).
 */
export function FindBar({ store, pages, onClose }: FindBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [ignoreAccents, setIgnoreAccents] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const anchoredLeft = useAnchoredLeft(panelRef);
  const { busy: replacing, dispatch: dispatchAfterScanFit } =
    useDispatchAfterScanFit(store);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Opening Find is a document-wide request, so pull in every page that lazy
  // loading has not read yet.
  useEffect(() => {
    return readAllPagesInBackground(store);
  }, [store]);

  const options: MatchOptions = useMemo(
    () => ({ matchCase, wholeWord, ignoreAccents }),
    [matchCase, wholeWord, ignoreAccents],
  );

  const matches: Match[] = useMemo(() => {
    if (!query) return [];
    const out: Match[] = [];
    for (const page of pages) {
      for (const run of page.runs) {
        const ranges = findMatches(run.text, query, options);
        for (const range of ranges) {
          out.push({
            pageIndex: page.pageIndex,
            runId: run.id,
            run,
            range,
            ranges,
          });
        }
      }
    }
    return out;
  }, [query, pages, options]);

  const focusMatch = useCallback(
    (idx: number) => {
      const m = matches[idx];
      if (!m) return;
      store.selection.selectOne(m.runId);
      store.selection.highlight.set({
        runId: m.runId,
        range: { start: m.range.start, end: m.range.end },
      });
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${m.runId}"]`,
      );
      revealOnPage(el, m.pageIndex);
    },
    [matches, store],
  );

  // Clear the highlight when the find bar unmounts.
  useEffect(() => () => store.selection.highlight.set(null), [store]);

  const next = useCallback(() => {
    if (matches.length === 0) return;
    const idx = (activeIndex + 1) % matches.length;
    setActiveIndex(idx);
    focusMatch(idx);
  }, [activeIndex, matches.length, focusMatch]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    const idx = (activeIndex - 1 + matches.length) % matches.length;
    setActiveIndex(idx);
    focusMatch(idx);
  }, [activeIndex, matches.length, focusMatch]);

  // Scroll the very first match into view when the SEARCH changes (query or
  // a toggle) - and only then. `matches` also recomputes on every document
  // edit (page snapshots refresh), and resetting to match #1 + stealing
  // selection/scroll on each keystroke elsewhere was hostile.
  const searchKey = `${matchCase ? 1 : 0}${wholeWord ? 1 : 0}${
    ignoreAccents ? 1 : 0
  }\u0000${query}`;
  const lastSearchRef = useRef("000\u0000");
  useEffect(() => {
    if (lastSearchRef.current !== searchKey) {
      lastSearchRef.current = searchKey;
      setActiveIndex(0);
      setReplaceCount(null);
      if (matches.length > 0) focusMatch(0);
    } else if (activeIndex >= matches.length && matches.length > 0) {
      // Matches shrank under the current index (an edit removed some);
      // clamp without stealing focus.
      setActiveIndex(0);
    }
  }, [searchKey, matches, focusMatch, activeIndex]);

  // Edits move the letters under a match, so the highlight follows the match rather than its old offsets.
  useEffect(() => {
    const m = matches[activeIndex];
    store.selection.highlight.set(
      m
        ? { runId: m.runId, range: { start: m.range.start, end: m.range.end } }
        : null,
    );
  }, [matches, activeIndex, store]);

  /**
   * Replace the CURRENT occurrence, the one highlighted. The replacement is
   * spliced literally, so "$&" stays "$&".
   */
  const doReplaceOne = useCallback(() => {
    if (!query || replacing) return;
    const m = matches[activeIndex];
    if (!m) return;
    // A locked run is still findable, but must not be rewritten.
    if (m.run.locked || m.run.textReadOnly) return;
    const updated = replaceMatches(m.run.text, [m.range], replace);
    if (updated === m.run.text) return;
    store.dispatch(
      new EditTextCommand({
        pageIndex: m.pageIndex,
        runId: m.runId,
        nextText: updated,
      }),
    );
    setReplaceCount(1);
  }, [query, replacing, replace, matches, activeIndex, store]);

  /**
   * Replace EVERY match. Each affected run gets one EditTextCommand,
   * batched into a single CompositeCommand so "Undo undoes the whole
   * Replace all".
   */
  const doReplaceAll = useCallback(async () => {
    const doc = store.document;
    if (!doc || replacing || !query || matches.length === 0) return;
    const targets: ScanFitTarget[] = [];
    const seen = new Set<string>();
    for (const m of matches) {
      // Skip locked runs: the lock is a user instruction, not a hint.
      if (m.run.locked || m.run.textReadOnly || seen.has(m.runId)) continue;
      seen.add(m.runId);
      if (replaceMatches(m.run.text, m.ranges, replace) === m.run.text)
        continue;
      const page = doc.loadedPages().find((p) => p.index === m.pageIndex);
      const run = page?.findRun(m.runId);
      if (page && run) targets.push({ page, run });
    }
    await dispatchAfterScanFit(targets, () => {
      const cmds: EditTextCommand[] = [];
      for (const { page, run: target } of targets) {
        const run = page.findRun(target.id);
        if (!run || run.locked || run.textReadOnly) continue;
        const ranges = findMatches(run.text, query, options);
        const updated = replaceMatches(run.text, ranges, replace);
        if (updated === run.text) continue;
        cmds.push(
          new EditTextCommand({
            pageIndex: page.index,
            runId: run.id,
            nextText: updated,
          }),
        );
      }
      setReplaceCount(cmds.length);
      return cmds;
    });
  }, [
    query,
    replace,
    options,
    matches,
    store,
    replacing,
    dispatchAfterScanFit,
  ]);

  const countLabel =
    matches.length === 0
      ? query
        ? t("pdfTextEditor.find.noMatches", "No matches")
        : ""
      : t("pdfTextEditor.find.count", "{{current}} of {{total}}", {
          current: activeIndex + 1,
          total: matches.length,
        });

  const toggles: Array<{
    on: boolean;
    set: () => void;
    label: string;
    glyph: string;
    underline?: boolean;
    testId: string;
  }> = [
    {
      on: matchCase,
      set: () => setMatchCase((v) => !v),
      label: t("pdfTextEditor.find.matchCase", "Match case"),
      glyph: "Aa",
      testId: "pdf-editor-find-match-case",
    },
    {
      on: wholeWord,
      set: () => setWholeWord((v) => !v),
      label: t("pdfTextEditor.find.wholeWord", "Whole word"),
      glyph: "ab",
      underline: true,
      testId: "pdf-editor-find-whole-word",
    },
    {
      on: ignoreAccents,
      set: () => setIgnoreAccents((v) => !v),
      label: t("pdfTextEditor.find.ignoreAccents", "Ignore accents"),
      glyph: "\u00e1",
      testId: "pdf-editor-find-ignore-accents",
    },
  ];

  const replaceToggleLabel = showReplace
    ? t("pdfTextEditor.find.hideReplace", "Hide replace")
    : t("pdfTextEditor.find.showReplace", "Show replace");

  return (
    <div
      ref={panelRef}
      className="pdf-editor-findbar"
      data-testid="pdf-editor-find-bar"
      style={
        anchoredLeft === null
          ? undefined
          : { left: anchoredLeft, right: "auto" }
      }
    >
      <div className="pdf-editor-findbar__grid">
        <Tooltip label={replaceToggleLabel}>
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            onClick={() => setShowReplace((v) => !v)}
            aria-label={replaceToggleLabel}
            aria-expanded={showReplace}
            data-testid="pdf-editor-find-toggle-replace"
            leftSection={
              <Icon
                name={showReplace ? "chevron-down" : "chevron-right"}
                size={16}
              />
            }
          />
        </Tooltip>
        <TextInput
          ref={inputRef}
          value={query}
          className={privateContentClassName}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t("pdfTextEditor.find.findPlaceholder", "Find")}
          aria-label={t("pdfTextEditor.find.findPlaceholder", "Find")}
          data-testid="pdf-editor-find-input"
          size="xs"
          rightSectionWidth={132}
          rightSectionPointerEvents="all"
          rightSection={
            <span className="pdf-editor-findbar__inline">
              <span
                className="pdf-editor-findbar__count"
                data-testid="pdf-editor-find-count"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {countLabel}
              </span>
              {toggles.map((toggle) => (
                <Tooltip key={toggle.testId} label={toggle.label}>
                  <button
                    type="button"
                    className={
                      toggle.underline
                        ? "pdf-editor-findbar__toggle pdf-editor-findbar__toggle--underlined"
                        : "pdf-editor-findbar__toggle"
                    }
                    aria-pressed={toggle.on}
                    aria-label={toggle.label}
                    data-testid={toggle.testId}
                    onClick={toggle.set}
                  >
                    {toggle.glyph}
                  </button>
                </Tooltip>
              ))}
            </span>
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <Tooltip label={t("pdfTextEditor.find.previous", "Previous match")}>
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            onClick={prev}
            disabled={matches.length === 0}
            aria-label={t("pdfTextEditor.find.previous", "Previous match")}
            data-testid="pdf-editor-find-prev"
            leftSection={<Icon name="chevron-up" size={18} />}
          />
        </Tooltip>
        <Tooltip label={t("pdfTextEditor.find.next", "Next match")}>
          <Button
            size="sm"
            variant="tertiary"
            accent="neutral"
            onClick={next}
            disabled={matches.length === 0}
            aria-label={t("pdfTextEditor.find.next", "Next match")}
            data-testid="pdf-editor-find-next"
            leftSection={<Icon name="chevron-down" size={18} />}
          />
        </Tooltip>
        <Tooltip label={t("pdfTextEditor.find.close", "Close find bar")}>
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={onClose}
            aria-label={t("pdfTextEditor.find.close", "Close find bar")}
            data-testid="pdf-editor-find-close"
            leftSection={<Icon name="x" size={18} />}
          />
        </Tooltip>

        {showReplace && (
          <>
            <TextInput
              className={`pdf-editor-findbar__replace ${privateContentClassName}`}
              value={replace}
              onChange={(e) => setReplace(e.currentTarget.value)}
              placeholder={t(
                "pdfTextEditor.find.replacePlaceholder",
                "Replace with",
              )}
              aria-label={t(
                "pdfTextEditor.find.replacePlaceholder",
                "Replace with",
              )}
              data-testid="pdf-editor-replace-input"
              size="xs"
              rightSectionWidth={96}
              rightSection={
                replaceCount !== null ? (
                  <span className="pdf-editor-findbar__inline">
                    <span className="pdf-editor-findbar__count">
                      {t("pdfTextEditor.find.replaced", "{{count}} replaced", {
                        count: replaceCount,
                      })}
                    </span>
                  </span>
                ) : null
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) void doReplaceAll();
                  else doReplaceOne();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onClose();
                }
              }}
            />
            <Tooltip label={t("pdfTextEditor.find.replace", "Replace")}>
              <Button
                size="sm"
                variant="tertiary"
                accent="neutral"
                onClick={doReplaceOne}
                disabled={replacing || matches.length === 0 || !query}
                aria-label={t("pdfTextEditor.find.replace", "Replace")}
                data-testid="pdf-editor-replace-one"
                leftSection={<Icon name="replace" size={18} />}
              />
            </Tooltip>
            <Tooltip label={t("pdfTextEditor.find.replaceAll", "Replace all")}>
              <Button
                size="sm"
                variant="tertiary"
                accent="neutral"
                onClick={() => void doReplaceAll()}
                loading={replacing}
                disabled={replacing || matches.length === 0 || !query}
                aria-label={t("pdfTextEditor.find.replaceAll", "Replace all")}
                data-testid="pdf-editor-replace-all"
                leftSection={<Icon name="replace-all" size={18} />}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
