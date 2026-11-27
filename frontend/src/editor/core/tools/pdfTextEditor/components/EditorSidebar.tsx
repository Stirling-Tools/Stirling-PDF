import { memo } from "react";
import { Box, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { CreateNewPdfButton } from "@editor/components/createPdf/CreateNewPdfButton";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import { EditorPanelTools } from "@editor/tools/pdfTextEditor/components/EditorPanelTools";
import { LanguagesInUse } from "@editor/tools/pdfTextEditor/components/inspector/languagesInUse";
import { SelectionInspector } from "@editor/tools/pdfTextEditor/components/inspector/SelectionInspector";
import {
  useSelectedFontNote,
  type ScanNote,
} from "@editor/tools/pdfTextEditor/hooks/useSelectedFontNote";
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

export interface SidebarProps extends Omit<ScanHintProps, "pages"> {
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
  /** Desktop: the panel's head shows the insert tools, and the selection bar carries the image tools. */
  desktop?: boolean;
}

export const EditorSidebar = memo(function EditorSidebar({
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
  desktop = false,
}: SidebarProps) {
  const controller = useToolbarController(store, state, selection);
  const geometry = useSelectionGeometry(store, state, selection);
  const hasSelection =
    selection.runIds.length > 0 ||
    selection.imageIds.length > 0 ||
    selection.shapeIds.length > 0 ||
    selection.formFieldId !== null;
  const fontNote = useSelectedFontNote(
    state,
    selection,
    selectedScanNote(store, state, selection),
  );
  const scanFontMatch = useScanFontMatch(store, state, selection);

  if (!state.hasDocument) {
    return (
      <Box p="md" style={{ flex: 1, overflow: "auto" }}>
        <EmptySidebar progress={state.progress} loading={state.loading} />
      </Box>
    );
  }

  // What is picked sits on top, where the eye already is. The document's own
  // settings stay below it, in reach whatever is selected.
  return (
    <Stack gap={0} data-testid="pdf-editor-sidebar-status">
      {desktop && (
        <Box
          // Sticky because the outer ScrollArea owns the scrolling, so the
          // insert tools must hold themselves in place.
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "var(--c-bg-raised)",
            borderBottom: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <EditorPanelTools store={store} state={state} />
        </Box>
      )}
      <LanguagesInUse.Provider value={state.languagesInUse}>
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
            showImageTools={!desktop}
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
        <DocumentInspector
          pages={state.pages}
          groupingMode={state.groupingMode}
          widthMode={state.widthMode}
          showRulers={state.showRulers}
          onSetGroupingMode={onSetGroupingMode}
          onSetWidthMode={onSetWidthMode}
          onSetShowRulers={onSetShowRulers}
        />
      </LanguagesInUse.Provider>
      {scanFontMatch && <ScanFontMatchModal match={scanFontMatch} />}
    </Stack>
  );
});

/** A single quiet line where a selection's properties would go. */
function NothingSelected(props: ScanHintProps) {
  const { t } = useTranslation();
  return (
    <Box px="md" py="sm" data-testid="pdf-editor-nothing-selected">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Icon
          name="square-dashed"
          size={18}
          style={{ color: "var(--c-text-muted)", flexShrink: 0, marginTop: 1 }}
        />
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            {t("pdfTextEditor.inspector.nothingSelected", "Nothing selected")}
          </Text>
          <Text size="xs" c="dimmed">
            {t(
              "pdfTextEditor.inspector.nothingSelectedHint",
              "Click any text, image or shape on the page to edit it, or add something new with Insert above.",
            )}
          </Text>
        </Stack>
      </Group>
      <ScanHint {...props} />
    </Box>
  );
}

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
      {!loading && <CreateNewPdfButton />}
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
