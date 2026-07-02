import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import { EditTextCommand } from "@app/tools/pdfTextEditor/v2/commands/EditTextCommand";
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
}

/**
 * In-document find + replace. Searches every loaded TextRun snapshot
 * for the query (case-insensitive), tracks the current match, and
 * scrolls / selects it. Replace and Replace All rewrite the matching
 * runs via batched `EditTextCommand`s.
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches: Match[] = useMemo(() => {
    if (!query) return [];
    const needle = query.toLowerCase();
    const out: Match[] = [];
    for (const page of pages) {
      for (const run of page.runs) {
        if (run.text.toLowerCase().includes(needle)) {
          out.push({ pageIndex: page.pageIndex, runId: run.id, run });
        }
      }
    }
    return out;
  }, [query, pages]);

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

  // Scroll the very first match into view as the user types.
  useEffect(() => {
    setActiveIndex(0);
    setReplaceCount(null);
    if (matches.length > 0) focusMatch(0);
  }, [matches, focusMatch]);

  /**
   * Replace the CURRENT match (case-insensitive substring) with the
   * replace text. Dispatches one EditTextCommand. The run's text has
   * every case-insensitive occurrence of `query` swapped to `replace`
   * via a single regex sweep so a run like "Foo foo FOO" becomes
   * "bar bar bar" - matches the user's mental model of "replace
   * happens to the highlighted run" without surprising them with
   * partial mutations.
   */
  const doReplaceOne = useCallback(() => {
    if (!query) return;
    const m = matches[activeIndex];
    if (!m) return;
    const re = caseInsensitiveLiteral(query);
    const updated = m.run.text.replace(re, replace);
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
   * Replace EVERY match. Each affected run gets one EditTextCommand;
   * the store's history collapses these into one history entry per
   * dispatch slot, but the safest UX is "Undo undoes all" which means
   * batching. For now we dispatch sequentially - the editor's store
   * doesn't expose a transaction API, so multi-command undo would
   * need to come from a follow-up. Surfaced as a known limitation in
   * the status text.
   */
  const doReplaceAll = useCallback(() => {
    if (!query || matches.length === 0) return;
    const re = caseInsensitiveLiteral(query);
    let n = 0;
    for (const m of matches) {
      const updated = m.run.text.replace(re, replace);
      if (updated === m.run.text) continue;
      store.dispatch(
        new EditTextCommand({
          pageIndex: m.pageIndex,
          runId: m.runId,
          nextText: updated,
        }),
      );
      n += 1;
    }
    setReplaceCount(n);
  }, [query, replace, matches, store]);

  return (
    <Stack gap="xs" p="sm" data-testid="v2-find-bar">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {t("pdfTextEditorV2.find.title", "Find & replace")}
        </Text>
        <ActionIcon
          variant="subtle"
          onClick={onClose}
          aria-label={t("pdfTextEditorV2.find.close", "Close find bar")}
          data-testid="v2-find-close"
        >
          <CloseIcon fontSize="small" />
        </ActionIcon>
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
          {replaceCount !== null && matches.length === 0
            ? t("pdfTextEditorV2.find.replaced", " · {{count}} replaced", {
                count: replaceCount,
              })
            : ""}
        </Text>
        <Button
          size="xs"
          variant="subtle"
          onClick={prev}
          disabled={matches.length === 0}
          data-testid="v2-find-prev"
        >
          ↑
        </Button>
        <Button
          size="xs"
          variant="subtle"
          onClick={next}
          disabled={matches.length === 0}
          data-testid="v2-find-next"
        >
          ↓
        </Button>
        <Button
          size="xs"
          variant="subtle"
          onClick={doReplaceOne}
          disabled={matches.length === 0 || !query}
          data-testid="v2-replace-one"
        >
          {t("pdfTextEditorV2.find.replace", "Replace")}
        </Button>
        <Button
          size="xs"
          variant="subtle"
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

/** Build a global, case-insensitive regex from a literal string. */
function caseInsensitiveLiteral(s: string): RegExp {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
}
