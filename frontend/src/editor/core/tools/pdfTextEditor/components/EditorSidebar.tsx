import { useCallback, useEffect, useMemo, useState } from "react";
import { useFontCompletionsGeneration } from "@editor/tools/pdfTextEditor/hooks/useDocumentFontCompletion";
import { Box, Center, Group, Stack, Tabs, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { useBulkTagging } from "@editor/tools/pdfTextEditor/hooks/useBulkTagging";
import { useHeadingOutline } from "@editor/tools/pdfTextEditor/hooks/useHeadingOutline";
import { useDocumentLanguage } from "@editor/tools/pdfTextEditor/hooks/useDocumentLanguage";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import { LanguagesInUse } from "@editor/tools/pdfTextEditor/components/inspector/languagesInUse";
import { SelectionInspector } from "@editor/tools/pdfTextEditor/components/inspector/SelectionInspector";
import { selectedFontNote } from "@editor/tools/pdfTextEditor/util/selectedFontNote";
import { readAllPagesInBackground } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { SetMarkedTaggedCommand } from "@editor/tools/pdfTextEditor/commands/SetMarkedTaggedCommand";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import {
  ScanHint,
  type ScanHintProps,
} from "@editor/tools/pdfTextEditor/components/ScanHint";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { useScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import {
  scanBlockMisaligned,
  scanBlockOffInk,
  scanTypingDropped,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { ScanFontMatchModal } from "@editor/tools/pdfTextEditor/components/inspector/ScanFontMatchModal";
import type {
  EditorViewState,
  LoadProgress,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  GroupingMode,
  SelectionState,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

interface SidebarProps extends Omit<ScanHintProps, "pages"> {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onSetGroupingMode: (mode: GroupingMode) => void;
  onSetWidthMode: (mode: WidthMode) => void;
  onSetShowRulers: (show: boolean) => void;
  initialTab?: SidebarTab;
}

export type SidebarTab = "selected" | "document";

export function EditorSidebar({
  store,
  state,
  selection,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  onSetGroupingMode,
  onSetWidthMode,
  onSetShowRulers,
  onRunOcr,
  ocrRunning,
  ocrAvailable,
  ocrBlockedReason,
  onRemovePassword,
  initialTab = "selected",
}: SidebarProps) {
  const { t } = useTranslation();
  const controller = useToolbarController(store, state, selection);
  const geometry = useSelectionGeometry(store, state, selection);
  const documentLanguage = useDocumentLanguage(store, state);
  const hasSelection =
    selection.runIds.length > 0 ||
    selection.imageIds.length > 0 ||
    selection.shapeIds.length > 0;
  const [tab, setTab] = useState<SidebarTab>(initialTab);

  // Picking something on the page is a request to see its properties, so the
  // panel follows. Clearing does NOT yank the tab back - a user who opened
  // Document then clicked bare page should stay where they were.
  useEffect(() => {
    if (hasSelection) setTab("selected");
  }, [hasSelection]);

  const fontNote = useSelectedFontNote(
    state,
    selection,
    selectedScanNote(store, state, selection),
  );
  const scanFontMatch = useScanFontMatch(store, state, selection);

  const editorDocument = store.document;
  const reviewingAccessibility = useMemo(
    () => ACCESSIBILITY_EDITING && !!editorDocument?.treatAsTagged(),
    [editorDocument],
  );
  const imageSelected = controller.imageAccessibility !== null;
  const artifactTextSelected = controller.textTag?.kind === "artifact";
  // Counts and Next cover only pages already read, which is just the first few
  // until the rest scroll into view; so do an artifact's matches on other pages.
  useEffect(() => {
    const reviewing =
      reviewingAccessibility && (tab === "document" || imageSelected);
    if (!reviewing && !(ACCESSIBILITY_EDITING && artifactTextSelected)) return;
    return readAllPagesInBackground(store);
  }, [reviewingAccessibility, tab, imageSelected, artifactTextSelected, store]);
  const setMarkedTagged = useCallback(
    (marked: boolean) => store.dispatch(new SetMarkedTaggedCommand(marked)),
    [store],
  );
  const headings = useHeadingOutline(
    store,
    state,
    reviewingAccessibility && tab === "document",
  );

  const bulkTagging = useBulkTagging(
    store,
    state,
    reviewingAccessibility && tab === "document",
  );

  // Following the selection only catches one appearing, so moving from one
  // selected image to the next would leave the new one's description hidden.
  const selectNextImageToReview = () => {
    if (controller.onSelectNextImageToReview()) setTab("selected");
  };

  if (!state.hasDocument) {
    return (
      <Box p="md" style={{ flex: 1, overflow: "auto" }}>
        <EmptySidebar progress={state.progress} loading={state.loading} />
      </Box>
    );
  }

  return (
    <Tabs
      value={tab}
      onChange={(next) => setTab((next as SidebarTab | null) ?? "selected")}
      data-testid="pdf-editor-sidebar-status"
    >
      <Group
        gap={0}
        wrap="nowrap"
        px="xs"
        // Sticky for the same reason the footer is: the outer ScrollArea owns
        // the scrolling, so the tabs must hold themselves in place.
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "var(--c-bg-raised)",
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Tabs.List style={{ flex: 1, borderBottom: "none" }}>
          <Tabs.Tab value="selected" data-testid="pdf-editor-tab-selected">
            {t("pdfTextEditor.inspector.tabSelected", "Selected")}
          </Tabs.Tab>
          <Tabs.Tab value="document" data-testid="pdf-editor-tab-document">
            {t("pdfTextEditor.inspector.tabDocument", "Document")}
          </Tabs.Tab>
        </Tabs.List>
      </Group>

      <LanguagesInUse.Provider value={state.languagesInUse}>
        <Box>
          <Tabs.Panel value="selected">
            {hasSelection ? (
              <SelectionInspector
                controller={controller}
                selection={selection}
                geometry={geometry}
                fontNote={fontNote}
                scanFontMatch={scanFontMatch}
                canGroup={canGroup}
                canUngroup={canUngroup}
                onGroup={onGroup}
                onUngroup={onUngroup}
              />
            ) : (
              <NothingSelected
                pages={state.pages}
                onRunOcr={onRunOcr}
                ocrRunning={ocrRunning}
                ocrAvailable={ocrAvailable}
                ocrBlockedReason={ocrBlockedReason}
                onRemovePassword={onRemovePassword}
              />
            )}
          </Tabs.Panel>
          <Tabs.Panel value="document">
            <DocumentInspector
              pages={state.pages}
              groupingMode={state.groupingMode}
              widthMode={state.widthMode}
              showRulers={state.showRulers}
              onSetGroupingMode={onSetGroupingMode}
              onSetWidthMode={onSetWidthMode}
              onSetShowRulers={onSetShowRulers}
              imageReview={
                reviewingAccessibility ? controller.imageReview : null
              }
              onSelectNextImageToReview={selectNextImageToReview}
              untaggedPages={bulkTagging.untaggedPages}
              onTagUntaggedContent={bulkTagging.tagAll}
              markedTagged={
                editorDocument?.canSetMarkedTagged()
                  ? editorDocument.markedTagged()
                  : null
              }
              onSetMarkedTagged={setMarkedTagged}
              hasTags={!!editorDocument?.hasStructureTree()}
              headingOutline={headings.outline}
              onSelectHeading={headings.selectHeading}
              documentLanguage={documentLanguage}
            />
          </Tabs.Panel>
        </Box>
      </LanguagesInUse.Provider>
      {scanFontMatch && <ScanFontMatchModal match={scanFontMatch} />}
    </Tabs>
  );
}

/** What the Selected tab shows before the user has picked anything. */
function NothingSelected(props: ScanHintProps) {
  const { t } = useTranslation();
  return (
    <Center p="xl" data-testid="pdf-editor-nothing-selected">
      <Stack align="center" gap={6}>
        <Icon
          name="square-dashed"
          size={34}
          style={{ color: "var(--mantine-color-dimmed)", opacity: 0.5 }}
        />
        <Text size="sm" fw={500} c="dimmed">
          {t("pdfTextEditor.inspector.nothingSelected", "Nothing selected")}
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          {t(
            "pdfTextEditor.inspector.nothingSelectedHint",
            "Click any text, image or shape on the page to edit it here.",
          )}
        </Text>
        <ScanHint {...props} />
      </Stack>
    </Center>
  );
}

type ScanNote = "misaligned" | "offInk" | "dropsTyping" | null;

function selectedScanNote(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): ScanNote {
  const doc = store.document;
  if (!doc) return null;
  const picked = new Set(selection.runIds);
  const runs = state.pages.flatMap((page) =>
    page.runs.flatMap((r) => {
      if (!picked.has(r.id)) return [];
      const run = doc.page(page.pageIndex).findRun(r.id);
      return run ? [run] : [];
    }),
  );
  if (runs.some((run) => scanBlockMisaligned(doc, run))) return "misaligned";
  if (runs.some((run) => scanBlockOffInk(doc, run))) return "offInk";
  if (runs.some((run) => scanTypingDropped(run))) return "dropsTyping";
  return null;
}

function useSelectedFontNote(
  state: EditorViewState,
  selection: SelectionState,
  scanNote: ScanNote,
): string | null {
  const { t } = useTranslation();
  const completions = useFontCompletionsGeneration();
  return useMemo(() => {
    const note = selectedFontNote(state.pages, selection.runIds);
    if (!note) return null;
    switch (note.kind) {
      case "scanned":
        if (scanNote === "misaligned")
          return t(
            "pdfTextEditor.inspector.scannedTextMisaligned",
            "Scanned text · its recognised words do not line up with the scan, so this block cannot be edited or deleted.",
          );
        if (scanNote === "offInk")
          return t(
            "pdfTextEditor.inspector.scannedTextOffInk",
            "Scanned text · its recognised words sit off the scanned words, so this block cannot be edited. Run OCR again.",
          );
        return scanNote === "dropsTyping"
          ? t(
              "pdfTextEditor.inspector.scannedTextNoFont",
              "Scanned text · typed words in this script cannot be drawn yet, so they are not kept. Deleting words still works.",
            )
          : t(
              "pdfTextEditor.inspector.scannedText",
              "Scanned text · changed words are covered and redrawn in a matching font.",
            );
      case "embeddedUnknown":
        return t(
          "pdfTextEditor.inspector.fontEmbedded",
          "Embedded font · a character it lacks falls back to Helvetica.",
        );
      case "deviceUnknown":
        return t(
          "pdfTextEditor.inspector.fontUnknownCoverage",
          "{{name}} · a character it lacks falls back to {{fallback}}.",
          { name: note.name, fallback: note.fallback },
        );
      case "completed":
        return note.source === "original"
          ? t(
              "pdfTextEditor.inspector.fontCompletedOriginal",
              "Embedded font · characters it lacks are drawn in {{name}}, the same font.",
              { name: note.name },
            )
          : t(
              "pdfTextEditor.inspector.fontCompletedClosest",
              "Embedded font · characters it lacks are drawn in {{name}}, the closest match available.",
              { name: note.name },
            );
      case "gap":
        return t(
          "pdfTextEditor.inspector.fontGap",
          "{{name}} · missing {{glyphs}} - typing those falls back to {{fallback}}.",
          { name: note.name, glyphs: note.glyphs, fallback: note.fallback },
        );
    }
  }, [state.pages, selection.runIds, scanNote, t, completions]);
}

function EmptySidebar({
  loading,
  progress,
}: {
  loading: boolean;
  progress: LoadProgress | null;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" data-testid="pdf-editor-sidebar-empty">
      <Text size="sm" fw={500}>
        {t("pdfTextEditor.sidebar.noFile", "No file loaded")}
      </Text>
      <Text size="xs" c="dimmed">
        {t(
          "pdfTextEditor.sidebar.noFileHint",
          "Pick a PDF from the Files panel on the left, or drop one in. The editor will open it automatically.",
        )}
      </Text>
      {loading && (
        <Stack gap={4} data-testid="pdf-editor-loading">
          <Text size="xs" c="dimmed">
            {progress?.stage ??
              t("pdfTextEditor.sidebar.opening", "Opening document...")}
          </Text>
          {progress && progress.total > 0 && (
            <Text size="xs" c="dimmed">
              {progress.current} / {progress.total}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
