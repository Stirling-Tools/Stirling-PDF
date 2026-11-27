import { memo } from "react";
import { Box, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { CreateNewPdfButton } from "@editor/components/createPdf/CreateNewPdfButton";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { useSelectionGeometry } from "@editor/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { DocumentInspector } from "@editor/tools/pdfTextEditor/components/inspector/DocumentInspector";
import { EditorPanelTools } from "@editor/tools/pdfTextEditor/components/EditorPanelTools";
import { LanguagesInUse } from "@editor/tools/pdfTextEditor/components/inspector/languagesInUse";
import { SelectionInspector } from "@editor/tools/pdfTextEditor/components/inspector/SelectionInspector";
import { useSelectionNote } from "@editor/tools/pdfTextEditor/hooks/useSelectedFontNote";
import {
  ScanHint,
  type ScanHintProps,
} from "@editor/tools/pdfTextEditor/components/ScanHint";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { useScanFontMatch } from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
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
  /**
   * Desktop: the panel's head shows the insert tools, and the floating
   * selection bar carries everything about the selection, so the panel holds
   * only the document. Elsewhere the selection's details lead the panel.
   */
  desktop?: boolean;
}

/** The position and size fields' height: a heading and two rows of inputs. */
const NOTHING_SELECTED_HEIGHT = "5.77rem";

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
  const hasSelection =
    selection.runIds.length > 0 ||
    selection.imageIds.length > 0 ||
    selection.shapeIds.length > 0 ||
    selection.formFieldId !== null;

  if (!state.hasDocument) {
    return (
      <Box p="md" style={{ flex: 1, overflow: "auto" }}>
        <EmptySidebar progress={state.progress} loading={state.loading} />
      </Box>
    );
  }

  const scanHint = {
    pages: state.pages,
    onRunOcr,
    ocrRunning,
    ocrAvailable,
    ocrBlockedReason,
    onRemovePassword,
  };
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
        {desktop ? (
          <div className="pdf-editor-panel-hint">
            <ScanHint {...scanHint} />
          </div>
        ) : hasSelection ? (
          <SelectionPanel
            store={store}
            state={state}
            selection={selection}
            controller={controller}
            canGroup={canGroup}
            canUngroup={canUngroup}
            onGroup={onGroup}
            onUngroup={onUngroup}
          />
        ) : (
          <NothingSelected {...scanHint} />
        )}
        <DocumentInspector
          store={store}
          pages={state.pages}
          onChangeFontEverywhere={controller.onChangeFontFamilyEverywhere}
          groupingMode={state.groupingMode}
          widthMode={state.widthMode}
          showRulers={state.showRulers}
          onSetGroupingMode={onSetGroupingMode}
          onSetWidthMode={onSetWidthMode}
          onSetShowRulers={onSetShowRulers}
        />
      </LanguagesInUse.Provider>
    </Stack>
  );
});

/** The selection's details where no floating bar carries them. */
function SelectionPanel({
  store,
  state,
  selection,
  controller,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
}: Pick<
  SidebarProps,
  | "store"
  | "state"
  | "selection"
  | "canGroup"
  | "canUngroup"
  | "onGroup"
  | "onUngroup"
> & { controller: ReturnType<typeof useToolbarController> }) {
  const geometry = useSelectionGeometry(store, state, selection);
  const fontNote = useSelectionNote(store, state, selection);
  const scanFontMatch = useScanFontMatch(store, state, selection);
  return (
    <>
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
      {scanFontMatch && <ScanFontMatchModal match={scanFontMatch} />}
    </>
  );
}

/** A single quiet line where a selection's properties would go. */
function NothingSelected(props: ScanHintProps) {
  const { t } = useTranslation();
  return (
    <Box px="md" py="md" data-testid="pdf-editor-nothing-selected">
      {/* As tall as the position and size fields a selection brings, so
          picking something does not shift the settings below. */}
      <Stack
        align="center"
        justify="center"
        gap={4}
        px="md"
        style={{
          height: NOTHING_SELECTED_HEIGHT,
          border: "1px dashed var(--c-border)",
          borderRadius: "var(--mantine-radius-md)",
          textAlign: "center",
        }}
      >
        <Icon
          name="square-dashed"
          size={18}
          style={{ color: "var(--c-text-muted)" }}
        />
        <Text size="sm" fw={500}>
          {t("pdfTextEditor.inspector.nothingSelected", "Nothing selected")}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            "pdfTextEditor.inspector.nothingSelectedHint",
            "Click any text, image or shape on the page to edit it.",
          )}
        </Text>
      </Stack>
      <ScanHint {...props} />
    </Box>
  );
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
