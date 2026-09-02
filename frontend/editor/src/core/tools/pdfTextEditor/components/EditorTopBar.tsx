import { useRef } from "react";
import { Group, Menu, Popover, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import TextFieldsIcon from "@mui/icons-material/TextFieldsOutlined";
import ImageIcon from "@mui/icons-material/ImageOutlined";
import SearchIcon from "@mui/icons-material/SearchOutlined";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TextFormatIcon from "@mui/icons-material/TextFormat";
import { Button } from "@app/ui/Button";
import { EditorFileSwitcher } from "@app/tools/pdfTextEditor/components/EditorFileSwitcher";
import { FormatGroup } from "@app/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { ObjectGroup } from "@app/tools/pdfTextEditor/components/toolbar/ObjectGroup";
import {
  NO_SHRINK,
  ToolbarSeparator,
  type Controller,
} from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { useElementWidth } from "@app/tools/pdfTextEditor/hooks/useElementWidth";
import "@app/tools/pdfTextEditor/components/EditorTopBar.css";

// Below this the insert/find/help controls stop being buttons and become one
// menu. Chosen so the contextual formatting group - the reason a selection is
// made at all - still gets room beside them rather than scrolling out of view.
const COMPACT_BELOW_PX = 900;

interface EditorTopBarProps {
  controller: Controller;
  /** True while the next page click drops a new text box. */
  addTextArmed: boolean;
  onToggleAddText: () => void;
  /** True while the find bar is showing, so the button can read as pressed. */
  findOpen: boolean;
  onToggleFind: () => void;
  onShowHelp: () => void;
  /** False before a document is open: only the identity block makes sense. */
  hasDocument: boolean;
  /** Unsaved-changes marker for the file chip. */
  dirty: boolean;
}

/**
 * Everything you do TO the document, in the place editors have always put it.
 *
 * The side panel used to carry the file you are editing, Insert, Find, help and
 * Save, which meant the two most common verbs in the tool lived at the bottom
 * of a scrolling panel on the far side of the screen from the page. They read
 * left to right the way a document editor's toolbar does: what file this is,
 * undo/redo, what you can add, what you can find, then the selection's own
 * formatting.
 *
 * Saving is deliberately NOT here. Every other tool pins its primary action to
 * the bottom of the side panel, and one tool answering "where is the button"
 * differently from the rest is worse than the extra travel - see
 * EditorPanelActions.
 *
 * Narrow bars fold insert, find and help into one overflow menu rather than
 * scrolling them out of sight - see COMPACT_BELOW_PX.
 */
export function EditorTopBar({
  controller,
  addTextArmed,
  onToggleAddText,
  findOpen,
  onToggleFind,
  onShowHelp,
  hasDocument,
  dirty,
}: EditorTopBarProps) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const hasSelection = controller.selectionCount > 0;
  const barRef = useRef<HTMLDivElement | null>(null);
  const barWidth = useElementWidth(barRef);
  // null until the first measurement: start roomy so the bar does not flash
  // through its compact form on mount.
  const compact = barWidth !== null && barWidth < COMPACT_BELOW_PX;

  const addTextLabel = addTextArmed
    ? t("pdfTextEditor.sidebar.clickPageToAddText", "Click page to add text")
    : t("pdfTextEditor.sidebar.addText", "Add text");
  const addImageLabel = t("pdfTextEditor.sidebar.addImage", "Add image");
  const findLabel = t("pdfTextEditor.settings.find", "Find in document");
  const helpLabel = t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts");

  return (
    <div
      className="pdf-editor-topbar"
      data-testid="pdf-editor-toolbar"
      data-compact={compact ? "true" : "false"}
      ref={barRef}
    >
      <div className="pdf-editor-topbar__lead">
        {session?.fileName ? (
          <EditorFileSwitcher
            currentFileId={session.fileId}
            currentFileName={session.fileName}
            dirty={dirty}
            onPick={session.pickFile}
          />
        ) : (
          <Text size="xs" c="dimmed" px={6}>
            {t("pdfTextEditor.sidebar.noFile", "No file loaded")}
          </Text>
        )}
      </div>

      {hasDocument && (
        <div className="pdf-editor-topbar__band">
          <Tooltip
            label={t("pdfTextEditor.toolbar.undoTooltip", "Undo (Ctrl+Z)")}
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={controller.onUndo}
              disabled={!controller.canUndo}
              aria-label={t("pdfTextEditor.toolbar.undo", "Undo")}
              data-testid="pdf-editor-undo"
              style={NO_SHRINK}
              leftSection={<UndoIcon fontSize="small" />}
            />
          </Tooltip>
          <Tooltip
            label={t("pdfTextEditor.toolbar.redoTooltip", "Redo (Ctrl+Y)")}
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={controller.onRedo}
              disabled={!controller.canRedo}
              aria-label={t("pdfTextEditor.toolbar.redo", "Redo")}
              data-testid="pdf-editor-redo"
              style={NO_SHRINK}
              leftSection={<RedoIcon fontSize="small" />}
            />
          </Tooltip>

          <ToolbarSeparator />

          {compact ? (
            /* One menu instead of three buttons. The formatting group that
               appears with a selection is what actually needs the room. */
            <Menu shadow="md" position="bottom-start" withinPortal>
              <Menu.Target>
                <Button
                  size="sm"
                  variant="tertiary"
                  accent="neutral"
                  aria-label={t("pdfTextEditor.toolbar.more", "More actions")}
                  data-testid="pdf-editor-overflow-menu"
                  style={NO_SHRINK}
                  leftSection={<MoreVertIcon fontSize="small" />}
                />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<TextFieldsIcon fontSize="small" />}
                  onClick={onToggleAddText}
                  data-testid="pdf-editor-add-text"
                >
                  {addTextLabel}
                </Menu.Item>
                <Menu.Item
                  leftSection={<ImageIcon fontSize="small" />}
                  onClick={() => session?.pickImage()}
                  disabled={!session}
                  data-testid="pdf-editor-add-image"
                >
                  {addImageLabel}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<SearchIcon fontSize="small" />}
                  onClick={onToggleFind}
                  data-testid="pdf-editor-open-find"
                >
                  {findLabel}
                </Menu.Item>
                <Menu.Item
                  leftSection={<HelpIcon fontSize="small" />}
                  onClick={onShowHelp}
                  data-testid="pdf-editor-help"
                >
                  {helpLabel}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <>
              {/* Add text keeps its label: it is the tool's whole point, and an
              unlabelled "T" is a guess. Add image rides beside it as an icon. */}
              <Tooltip
                label={t(
                  "pdfTextEditor.toolbar.addTextTooltip",
                  "Add a text box - then click the page",
                )}
              >
                <Button
                  size="sm"
                  variant={addTextArmed ? "primary" : "tertiary"}
                  accent={addTextArmed ? "default" : "neutral"}
                  leftSection={<TextFieldsIcon fontSize="small" />}
                  onClick={onToggleAddText}
                  data-testid="pdf-editor-add-text"
                  style={NO_SHRINK}
                >
                  {addTextArmed
                    ? t(
                        "pdfTextEditor.sidebar.clickPageToAddText",
                        "Click page to add text",
                      )
                    : t("pdfTextEditor.sidebar.addText", "Add text")}
                </Button>
              </Tooltip>
              <Tooltip label={t("pdfTextEditor.sidebar.addImage", "Add image")}>
                <Button
                  size="sm"
                  variant="tertiary"
                  accent="neutral"
                  leftSection={<ImageIcon fontSize="small" />}
                  onClick={() => session?.pickImage()}
                  disabled={!session}
                  aria-label={t("pdfTextEditor.sidebar.addImage", "Add image")}
                  data-testid="pdf-editor-add-image"
                  style={NO_SHRINK}
                />
              </Tooltip>
              <Tooltip
                label={t("pdfTextEditor.settings.findTooltip", "Find (Ctrl+F)")}
              >
                <Button
                  // Pressed while the bar is showing, so it reads as the toggle it
                  // is - clicking it again puts the find bar away.
                  variant={findOpen ? "primary" : "tertiary"}
                  accent={findOpen ? "default" : "neutral"}
                  size="sm"
                  aria-pressed={findOpen}
                  onClick={onToggleFind}
                  aria-label={t(
                    "pdfTextEditor.settings.find",
                    "Find in document",
                  )}
                  data-testid="pdf-editor-open-find"
                  style={NO_SHRINK}
                  leftSection={<SearchIcon fontSize="small" />}
                />
              </Tooltip>
            </>
          )}

          {hasSelection && (
            <>
              <ToolbarSeparator />
              {compact ? (
                /* Font family, size, colour, outline, italic and case are the
                   widest thing on the bar by far, and they only appear once
                   something is selected - which is exactly when a narrow bar
                   ran out of room and started dropping controls off the end.
                   Behind one button they cost 40px instead of 500. */
                <Popover position="bottom-start" withinPortal shadow="md">
                  <Popover.Target>
                    <Button
                      size="sm"
                      variant="tertiary"
                      accent="neutral"
                      aria-label={t(
                        "pdfTextEditor.toolbar.formatting",
                        "Text formatting",
                      )}
                      data-testid="pdf-editor-format-menu"
                      style={NO_SHRINK}
                      leftSection={<TextFormatIcon fontSize="small" />}
                    />
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Group gap="xs" wrap="wrap" maw={320}>
                      <FormatGroup controller={controller} />
                    </Group>
                  </Popover.Dropdown>
                </Popover>
              ) : (
                <FormatGroup controller={controller} />
              )}
              <ToolbarSeparator />
              {/* ObjectGroup stays inline either way: two icons and a menu. */}
              <ObjectGroup controller={controller} />
            </>
          )}
        </div>
      )}

      <div className="pdf-editor-topbar__trail">
        {hasDocument && !compact && (
          <Tooltip
            label={t("pdfTextEditor.help.tooltip", "Keyboard shortcuts (?)")}
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              onClick={onShowHelp}
              aria-label={t(
                "pdfTextEditor.help.ariaLabel",
                "Keyboard shortcuts",
              )}
              data-testid="pdf-editor-help"
              style={NO_SHRINK}
              leftSection={<HelpIcon fontSize="small" />}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
