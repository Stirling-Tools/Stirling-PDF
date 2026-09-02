import { useEffect, useMemo, useState } from "react";
import { Box, Center, Group, Stack, Tabs, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import HighlightAltIcon from "@mui/icons-material/HighlightAltOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFieldsOutlined";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Button } from "@app/ui/Button";
import { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";
import { useSelectionGeometry } from "@app/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { DocumentInspector } from "@app/tools/pdfTextEditor/components/inspector/DocumentInspector";
import { SelectionInspector } from "@app/tools/pdfTextEditor/components/inspector/SelectionInspector";
import { analyzePageFonts } from "@app/tools/pdfTextEditor/util/pageFonts";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type {
  EditorViewState,
  LoadProgress,
} from "@app/tools/pdfTextEditor/store/EditorStore";
import type {
  GroupingMode,
  SelectionState,
  WidthMode,
} from "@app/tools/pdfTextEditor/types";

interface SidebarProps {
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
  onOpenFind: () => void;
  onShowHelp: () => void;
  /** True while the next page click drops a new text box. */
  addTextArmed: boolean;
  onToggleAddText: () => void;
  onPickImage: () => void;
}

type TabId = "selected" | "document";

/**
 * The editor's right-hand panel: a properties inspector for the selection.
 *
 * Two tabs and one overflow menu. "Selected" only ever shows controls that can
 * act on what is picked right now; "Document" holds the facts about the file;
 * everything set-and-forget lives behind the menu. Nothing that never changes
 * competes for space with the thing the user is actually editing.
 */
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
  onOpenFind,
  onShowHelp,
  addTextArmed,
  onToggleAddText,
  onPickImage,
}: SidebarProps) {
  const { t } = useTranslation();
  const controller = useToolbarController(store, state, selection);
  const geometry = useSelectionGeometry(store, state, selection);
  const hasSelection =
    selection.runIds.length > 0 || selection.imageIds.length > 0;
  const [tab, setTab] = useState<TabId>("selected");

  // Picking something on the page is a request to see its properties, so the
  // panel follows. Clearing does NOT yank the tab back - a user who opened
  // Document then clicked bare page should stay where they were.
  useEffect(() => {
    if (hasSelection) setTab("selected");
  }, [hasSelection]);

  const fontNote = useSelectedFontNote(state, selection);

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
      onChange={(next) => setTab((next as TabId | null) ?? "selected")}
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
        <Tooltip label={t("pdfTextEditor.settings.find", "Find (Ctrl+F)")}>
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={onOpenFind}
            aria-label={t("pdfTextEditor.settings.find", "Find in document")}
            data-testid="pdf-editor-open-find"
            leftSection={<SearchIcon fontSize="small" />}
          />
        </Tooltip>
        <Tooltip
          label={t("pdfTextEditor.help.tooltip", "Keyboard shortcuts (?)")}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={onShowHelp}
            aria-label={t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts")}
            data-testid="pdf-editor-help"
            leftSection={<HelpIcon fontSize="small" />}
          />
        </Tooltip>
      </Group>

      {/* Insert applies in either tab and to no selection in particular, so it
          rides with the sticky header rather than inside a panel. */}
      <Group
        gap="xs"
        grow
        wrap="nowrap"
        px="md"
        py="xs"
        style={{
          position: "sticky",
          top: 37,
          zIndex: 2,
          background: "var(--c-bg-raised)",
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Button
          size="sm"
          variant={addTextArmed ? "primary" : "secondary"}
          accent={addTextArmed ? "default" : "neutral"}
          leftSection={<TextFieldsIcon fontSize="small" />}
          onClick={onToggleAddText}
          data-testid="pdf-editor-add-text"
        >
          {addTextArmed
            ? t("pdfTextEditor.sidebar.clickPageToAddText", "Click page")
            : t("pdfTextEditor.sidebar.addText", "Add text")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          accent="neutral"
          leftSection={<ImageIcon fontSize="small" />}
          onClick={onPickImage}
          data-testid="pdf-editor-add-image"
        >
          {t("pdfTextEditor.sidebar.addImage", "Add image")}
        </Button>
      </Group>

      <Box>
        <Tabs.Panel value="selected">
          {hasSelection ? (
            <SelectionInspector
              controller={controller}
              selection={selection}
              geometry={geometry}
              fontNote={fontNote}
              canGroup={canGroup}
              canUngroup={canUngroup}
              onGroup={onGroup}
              onUngroup={onUngroup}
            />
          ) : (
            <NothingSelected />
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
          />
        </Tabs.Panel>
      </Box>
    </Tabs>
  );
}

/** What the Selected tab shows before the user has picked anything. */
function NothingSelected() {
  const { t } = useTranslation();
  return (
    <Center p="xl" data-testid="pdf-editor-nothing-selected">
      <Stack align="center" gap={6}>
        <HighlightAltIcon
          style={{
            fontSize: 34,
            color: "var(--mantine-color-dimmed)",
            opacity: 0.5,
          }}
        />
        <Text size="sm" fw={500} c="dimmed">
          {t("pdfTextEditor.inspector.nothingSelected", "Nothing selected")}
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          {t(
            "pdfTextEditor.inspector.nothingSelectedHint",
            "Click any text or image on the page to edit it here.",
          )}
        </Text>
      </Stack>
    </Center>
  );
}

/**
 * One line about the selected runs' font - or nothing at all.
 *
 * It speaks only when a character the user types might not survive: a missing
 * glyph, or an embedded face whose coverage we could not read. A font that can
 * render everything says nothing, because "all fine" is not worth a line.
 */
function useSelectedFontNote(
  state: EditorViewState,
  selection: SelectionState,
): string | null {
  const { t } = useTranslation();
  return useMemo(() => {
    if (selection.runIds.length === 0) return null;
    const picked = new Set(selection.runIds);
    const fontIds = new Set<string>();
    for (const page of state.pages)
      for (const run of page.runs)
        if (picked.has(run.id)) fontIds.add(run.fontId);
    if (fontIds.size === 0) return null;

    const fonts = analyzePageFonts(state.pages).filter((f) =>
      // analyzePageFonts keys by display name + status, so match on the names
      // the selected runs' fonts resolve to.
      Array.from(fontIds).some((id) => id.endsWith(f.name)),
    );
    if (fonts.length !== 1) return null;
    const font = fonts[0];
    const gaps = font.coverage.known ? font.coverage.missing : [];
    if (gaps.length > 0) {
      return t(
        "pdfTextEditor.inspector.fontGap",
        "{{name}} · missing {{glyphs}} - typing those falls back to Helvetica.",
        { name: font.name, glyphs: gaps.slice(0, 6).join(" ") },
      );
    }
    // Silent when the font can render anything the user types: a standard
    // base-14 face, or an embedded one whose cmap we read and found complete.
    if (font.status === "standard") return null;
    if (font.coverage.known) return null;
    return t(
      "pdfTextEditor.inspector.fontEmbedded",
      "Embedded font · a character it lacks falls back to Helvetica.",
    );
  }, [state.pages, selection.runIds, t]);
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
