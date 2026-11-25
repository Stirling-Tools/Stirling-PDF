import { memo, useEffect, useState } from "react";
import { Box, Center, Group, Stack, Tabs, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { CreateNewPdfButton } from "@editor/components/createPdf/CreateNewPdfButton";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
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
  initialTab?: SidebarTab;
}

export type SidebarTab = "selected" | "document";

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
  initialTab = "selected",
}: SidebarProps) {
  const { t } = useTranslation();
  const controller = useToolbarController(store, state, selection);
  const geometry = useSelectionGeometry(store, state, selection);
  const hasSelection =
    selection.runIds.length > 0 ||
    selection.imageIds.length > 0 ||
    selection.shapeIds.length > 0 ||
    selection.formFieldId !== null;
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
            {tab === "document" && (
              <DocumentInspector
                pages={state.pages}
                groupingMode={state.groupingMode}
                widthMode={state.widthMode}
                showRulers={state.showRulers}
                onSetGroupingMode={onSetGroupingMode}
                onSetWidthMode={onSetWidthMode}
                onSetShowRulers={onSetShowRulers}
              />
            )}
          </Tabs.Panel>
        </Box>
      </LanguagesInUse.Provider>
      {scanFontMatch && <ScanFontMatchModal match={scanFontMatch} />}
    </Tabs>
  );
});

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
