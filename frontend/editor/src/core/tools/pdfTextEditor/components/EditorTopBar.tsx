import { useRef } from "react";
import { Icon } from "@app/ui/Icon";
import { Group, Menu, Popover, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
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
import { modShortcut } from "@app/utils/hotkeys";
import "@app/tools/pdfTextEditor/components/EditorTopBar.css";

const COMPACT_BELOW_PX = 900;

interface EditorTopBarProps {
  controller: Controller;
  addTextArmed: boolean;
  onToggleAddText: () => void;
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
              disabled={!controller.canUndo}
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
              disabled={!controller.canRedo}
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
                  leftSection={<Icon name="image" size={20} />}
                  onClick={() => session?.pickImage()}
                  disabled={!session}
                  aria-label={t("pdfTextEditor.sidebar.addImage", "Add image")}
                  data-testid="pdf-editor-add-image"
                  style={NO_SHRINK}
                />
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
              <ToolbarSeparator />
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
              leftSection={<Icon name="circle-question-mark" size={20} />}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
