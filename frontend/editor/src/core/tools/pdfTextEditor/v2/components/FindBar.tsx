import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import { EditTextCommand } from "@app/tools/pdfTextEditor/v2/commands/EditTextCommand";
import { CompositeCommand } from "@app/tools/pdfTextEditor/v2/commands/CompositeCommand";
import {
  findMatches,
  replaceMatches,
} from "@app/tools/pdfTextEditor/v2/util/textMatching";
import type {
  MatchOptions,
  TextMatch,
} from "@app/tools/pdfTextEditor/v2/util/textMatching";
import { ensureAllPagesRead } from "@app/tools/pdfTextEditor/v2/hooks/useDocumentLoader";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type {
  PageSnapshot,
  TextRunSnapshot,
} from "@app/tools/pdfTextEditor/v2/types";

interface FindBarProps {
  store: EditorStore;
  pages: PageSnapshot[];
  onClose: () => void;
}

interface Match {
  pageIndex: number;
  runId: string;
  /** Run snapshot (cached so navigation can scroll to it). */
  run: TextRunSnapshot;
  /** Every occurrence inside this run, as offsets into `run.text`. */
  ranges: TextMatch[];
}

/**
 * In-document find + replace. Searches every loaded TextRun snapshot
 * for the query (case, whole-word and accent handling come from the
 * toggles), tracks the current match, and scrolls / selects it.
 * Replace and Replace All rewrite the matching runs via batched
 * `EditTextCommand`s.
 *
 * Triggered from Ctrl+F in PdfTextEditorV2. Matches that haven't been
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Opening Find is a document-wide request, so pull in every page that lazy
  // loading has not read yet. Yield first: the read is synchronous, and on a
  // long document it would otherwise block before the bar has painted.
  useEffect(() => {
    const id = setTimeout(() => ensureAllPagesRead(store), 0);
    return () => clearTimeout(id);
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
        if (ranges.length > 0) {
          out.push({ pageIndex: page.pageIndex, runId: run.id, run, ranges });
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
      store.selection.highlight.set(m.runId);
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${m.runId}"]`,
      );
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
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

  /**
   * Replace the CURRENT match with the replace text. Dispatches one
   * EditTextCommand. Every occurrence inside that run is swapped in a
   * single pass so a run like "Foo foo FOO" becomes "bar bar bar" -
   * matches the user's mental model of "replace happens to the
   * highlighted run" without surprising them with partial mutations.
   * The replacement is spliced literally, so "$&" stays "$&".
   */
  const doReplaceOne = useCallback(() => {
    if (!query) return;
    const m = matches[activeIndex];
    if (!m) return;
    // A locked run is still findable, but must not be rewritten.
    if (m.run.locked) return;
    const updated = replaceMatches(m.run.text, m.ranges, replace);
    if (updated === m.run.text) return;
    store.dispatch(
      new EditTextCommand({
        pageIndex: m.pageIndex,
        runId: m.runId,
        nextText: updated,
      }),
    );
    setReplaceCount(1);
  }, [query, replace, matches, activeIndex, store]);

  /**
   * Replace EVERY match. Each affected run gets one EditTextCommand,
   * batched into a single CompositeCommand so "Undo undoes the whole
   * Replace all".
   */
  const doReplaceAll = useCallback(() => {
    if (!query || matches.length === 0) return;
    let n = 0;
    const cmds: EditTextCommand[] = [];
    for (const m of matches) {
      // Skip locked runs: the lock is a user instruction, not a hint.
      if (m.run.locked) continue;
      const updated = replaceMatches(m.run.text, m.ranges, replace);
      if (updated === m.run.text) continue;
      cmds.push(
        new EditTextCommand({
          pageIndex: m.pageIndex,
          runId: m.runId,
          nextText: updated,
        }),
      );
      n += 1;
    }
    if (cmds.length === 1) store.dispatch(cmds[0]);
    else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    setReplaceCount(n);
  }, [query, replace, matches, store]);

  return (
    <Stack gap="xs" p="sm" data-testid="v2-find-bar">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {t("pdfTextEditorV2.find.title", "Find & replace")}
        </Text>
        <Button
          variant="tertiary"
          size="sm"
          onClick={onClose}
          aria-label={t("pdfTextEditorV2.find.close", "Close find bar")}
          data-testid="v2-find-close"
          leftSection={<CloseIcon fontSize="small" />}
        />
      </Group>
      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={t("pdfTextEditorV2.find.findPlaceholder", "Find")}
        data-testid="v2-find-input"
        size="xs"
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
      <TextInput
        value={replace}
        onChange={(e) => setReplace(e.currentTarget.value)}
        placeholder={t(
          "pdfTextEditorV2.find.replacePlaceholder",
          "Replace with",
        )}
        data-testid="v2-replace-input"
        size="xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) doReplaceAll();
            else doReplaceOne();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <Group gap="xs" align="center">
        <Tooltip label={t("pdfTextEditorV2.find.matchCase", "Match case")}>
          <Button
            size="sm"
            variant={matchCase ? "primary" : "tertiary"}
            onClick={() => setMatchCase((v) => !v)}
            aria-pressed={matchCase}
            aria-label={t("pdfTextEditorV2.find.matchCase", "Match case")}
            data-testid="v2-find-match-case"
          >
            Aa
          </Button>
        </Tooltip>
        <Tooltip label={t("pdfTextEditorV2.find.wholeWord", "Whole word")}>
          <Button
            size="sm"
            variant={wholeWord ? "primary" : "tertiary"}
            onClick={() => setWholeWord((v) => !v)}
            aria-pressed={wholeWord}
            aria-label={t("pdfTextEditorV2.find.wholeWord", "Whole word")}
            data-testid="v2-find-whole-word"
          >
            [ab]
          </Button>
        </Tooltip>
        <Tooltip
          label={t("pdfTextEditorV2.find.ignoreAccents", "Ignore accents")}
        >
          <Button
            size="sm"
            variant={ignoreAccents ? "primary" : "tertiary"}
            onClick={() => setIgnoreAccents((v) => !v)}
            aria-pressed={ignoreAccents}
            aria-label={t(
              "pdfTextEditorV2.find.ignoreAccents",
              "Ignore accents",
            )}
            data-testid="v2-find-ignore-accents"
          >
            á=a
          </Button>
        </Tooltip>
      </Group>
      <Group gap="xs" align="center">
        <Text
          size="xs"
          c="dimmed"
          data-testid="v2-find-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {matches.length === 0
            ? query
              ? t("pdfTextEditorV2.find.noMatches", "No matches")
              : t("pdfTextEditorV2.find.typeToSearch", "Type to search")
            : t("pdfTextEditorV2.find.count", "{{current}} of {{total}}", {
                current: activeIndex + 1,
                total: matches.length,
              })}
          {replaceCount !== null
            ? t("pdfTextEditorV2.find.replaced", " · {{count}} replaced", {
                count: replaceCount,
              })
            : ""}
        </Text>
        <Button
          size="sm"
          variant="tertiary"
          onClick={prev}
          disabled={matches.length === 0}
          aria-label={t("pdfTextEditorV2.find.previous", "Previous match")}
          data-testid="v2-find-prev"
        >
          ↑
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          onClick={next}
          disabled={matches.length === 0}
          aria-label={t("pdfTextEditorV2.find.next", "Next match")}
          data-testid="v2-find-next"
        >
          ↓
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          onClick={doReplaceOne}
          disabled={matches.length === 0 || !query}
          data-testid="v2-replace-one"
        >
          {t("pdfTextEditorV2.find.replace", "Replace")}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          onClick={doReplaceAll}
          disabled={matches.length === 0 || !query}
          data-testid="v2-replace-all"
        >
          {t("pdfTextEditorV2.find.replaceAll", "Replace all")}
        </Button>
      </Group>
    </Stack>
  );
}
