import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { PageSnapshot, TextRunSnapshot } from "@app/tools/pdfTextEditor/v2/types";

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
 * In-document find. Searches every loaded TextRun snapshot for the
 * query (case-insensitive), tracks the current match, and scrolls /
 * selects it. Triggered from Ctrl+F in PdfTextEditorV2.
 *
 * The sidebar surfaces this; matches that haven't been lazy-loaded yet
 * won't show until the user scrolls past those pages (the
 * `ensurePageRead` hook will populate them on intersection).
 */
export function FindBar({ store, pages, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

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
    if (matches.length > 0) focusMatch(0);
  }, [matches, focusMatch]);

  return (
    <Stack gap="xs" p="sm" data-testid="v2-find-bar">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Find in document
        </Text>
        <ActionIcon
          variant="subtle"
          onClick={onClose}
          aria-label="Close find bar"
          data-testid="v2-find-close"
        >
          <CloseIcon fontSize="small" />
        </ActionIcon>
      </Group>
      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Type to search"
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
      <Group gap="xs" align="center">
        <Text size="xs" c="dimmed" data-testid="v2-find-count">
          {matches.length === 0
            ? query
              ? "No matches"
              : "Type to search"
            : `${activeIndex + 1} of ${matches.length}`}
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
      </Group>
    </Stack>
  );
}
