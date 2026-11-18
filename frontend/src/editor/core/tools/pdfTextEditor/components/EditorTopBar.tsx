import { useRef } from "react";
import { Icon } from "@editor/ui/Icon";
import { Group, Menu, Popover, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { ObjectGroup } from "@editor/tools/pdfTextEditor/components/toolbar/ObjectGroup";
import {
  NO_SHRINK,
  ToolbarSeparator,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import { useEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { useElementWidth } from "@editor/tools/pdfTextEditor/hooks/useElementWidth";
import { modShortcut } from "@editor/utils/hotkeys";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";

const COMPACT_BELOW_PX = 900;

interface EditorTopBarProps {
  controller: Controller;
  addTextArmed: boolean;
  onToggleAddText: () => void;
  addTableArmed: boolean;
  onToggleAddTable: () => void;
  findOpen: boolean;
  onToggleFind: () => void;
  onShowHelp: () => void;
  hasDocument: boolean;
  dirty: boolean;
}

export function EditorTopBar({
  controller,
  addTextArmed,
  onToggleAddText,
  addTableArmed,
  onToggleAddTable,
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
  const compact = barWidth !== null && barWidth < COMPACT_BELOW_PX;

  const addTextLabel = addTextArmed
    ? t("pdfTextEditor.sidebar.clickPageToAddText", "Click page to add text")
    : t("pdfTextEditor.sidebar.addText", "Add text");
  const addImageLabel = t("pdfTextEditor.sidebar.addImage", "Add image");
  const addTableLabel = addTableArmed
    ? t(
        "pdfTextEditor.sidebar.clickPageToAddTable",
        "Click page to add a table",
      )
    : t("pdfTextEditor.sidebar.addTable", "Add table");
  const findLabel = t("pdfTextEditor.settings.find", "Find in document");
  const helpLabel = t("pdfTextEditor.help.ariaLabel", "Keyboard shortcuts");

  return (
    <div
      className="pdf-editor-topbar"
      data-testid="pdf-editor-toolbar"
      data-compact={compact ? "true" : "false"}
      ref={barRef}
    >
      {/* The viewer's own bar names the file; this only flags unsaved edits. */}
      {dirty && (
        <div className="pdf-editor-topbar__lead">
          <span
            className="pdf-editor-topbar__dirty"
            data-testid="pdf-editor-dirty-dot"
            role="status"
            aria-label={t("pdfTextEditor.unsaved", "(unsaved)")}
            title={t("pdfTextEditor.unsaved", "(unsaved)")}
          />
        </div>
      )}

      {/* Shown from the first frame, idle until the document is read, so the
          bar does not pop in after the load. */}
      <div className="pdf-editor-topbar__band">
        <Tooltip
          label={t("pdfTextEditor.toolbar.undoTooltip", {
            defaultValue: "Undo ({{shortcut}})",
            shortcut: modShortcut("Z"),
          })}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={controller.onUndo}
            disabled={!hasDocument || !controller.canUndo}
            aria-label={t("pdfTextEditor.toolbar.undo", "Undo")}
            data-testid="pdf-editor-undo"
            style={NO_SHRINK}
            leftSection={<Icon name="undo-2" size={20} />}
          />
        </Tooltip>
        <Tooltip
          label={t("pdfTextEditor.toolbar.redoTooltip", {
            defaultValue: "Redo ({{shortcut}})",
            shortcut: modShortcut("Y"),
          })}
        >
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={controller.onRedo}
            disabled={!hasDocument || !controller.canRedo}
            aria-label={t("pdfTextEditor.toolbar.redo", "Redo")}
            data-testid="pdf-editor-redo"
            style={NO_SHRINK}
            leftSection={<Icon name="redo-2" size={20} />}
          />
        </Tooltip>

        <ToolbarSeparator />

        {compact ? (
          <Menu shadow="md" position="bottom-start" withinPortal>
            <Menu.Target>
              <Button
                size="sm"
                variant="tertiary"
                accent="neutral"
                aria-label={t("pdfTextEditor.toolbar.more", "More actions")}
                disabled={!hasDocument}
                data-testid="pdf-editor-overflow-menu"
                style={NO_SHRINK}
                leftSection={<Icon name="ellipsis-vertical" size={20} />}
              />
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="type" size={20} />}
                onClick={onToggleAddText}
                data-testid="pdf-editor-add-text"
              >
                {addTextLabel}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="table" size={20} />}
                onClick={onToggleAddTable}
                data-testid="pdf-editor-add-table"
                aria-pressed={addTableArmed}
              >
                {addTableLabel}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="image" size={20} />}
                onClick={() => session?.pickImage()}
                disabled={!session}
                data-testid="pdf-editor-add-image"
              >
                {addImageLabel}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="search" size={20} />}
                onClick={onToggleFind}
                data-testid="pdf-editor-open-find"
              >
                {findLabel}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="circle-question-mark" size={20} />}
                onClick={onShowHelp}
                data-testid="pdf-editor-help"
              >
                {helpLabel}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <>
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
                leftSection={<Icon name="type" size={20} />}
                onClick={onToggleAddText}
                disabled={!hasDocument}
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
            <Tooltip label={addTableLabel}>
              <Button
                size="sm"
                variant={addTableArmed ? "primary" : "tertiary"}
                accent={addTableArmed ? "default" : "neutral"}
                leftSection={<Icon name="table" size={20} />}
                onClick={onToggleAddTable}
                aria-label={addTableLabel}
                aria-pressed={addTableArmed}
                disabled={!hasDocument}
                data-testid="pdf-editor-add-table"
                style={NO_SHRINK}
              />
            </Tooltip>
            <Tooltip label={t("pdfTextEditor.sidebar.addImage", "Add image")}>
              <Button
                size="sm"
                variant="tertiary"
                accent="neutral"
                leftSection={<Icon name="image" size={20} />}
                onClick={() => session?.pickImage()}
                disabled={!session || !hasDocument}
                aria-label={t("pdfTextEditor.sidebar.addImage", "Add image")}
                data-testid="pdf-editor-add-image"
                style={NO_SHRINK}
              >
                {t("pdfTextEditor.sidebar.image", "Image")}
              </Button>
            </Tooltip>
            <Tooltip
              label={t("pdfTextEditor.settings.findTooltip", {
                defaultValue: "Find ({{shortcut}})",
                shortcut: modShortcut("F"),
              })}
            >
              <Button
                variant={findOpen ? "primary" : "tertiary"}
                accent={findOpen ? "default" : "neutral"}
                size="sm"
                aria-pressed={findOpen}
                onClick={onToggleFind}
                disabled={!hasDocument}
                aria-label={t(
                  "pdfTextEditor.settings.find",
                  "Find in document",
                )}
                data-testid="pdf-editor-open-find"
                style={NO_SHRINK}
                leftSection={<Icon name="search" size={20} />}
              />
            </Tooltip>
          </>
        )}

        {hasSelection && (
          <>
            <ToolbarSeparator />
            {/* Ahead of the formatting group: the band scrolls sideways
                  under macOS's hidden scrollbars, so anything past the edge
                  is invisible rather than visibly clipped. */}
            <ObjectGroup controller={controller} />
            <ToolbarSeparator />
            {compact ? (
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
                    leftSection={<Icon name="case-sensitive" size={20} />}
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
          </>
        )}
      </div>

      <div className="pdf-editor-topbar__trail">
        {!compact && (
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
              leftSection={<Icon name="circle-question-mark" size={20} />}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
