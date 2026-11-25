import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { offsetClearing } from "@editor/tools/pdfTextEditor/util/clearingOffset";
import "@editor/tools/pdfTextEditor/components/EditorTopBar.css";

const COMPACT_BELOW_PX = 900;
const FORMAT_MENU_GAP = 8;

function FormatMenu({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(FORMAT_MENU_GAP);
  const targetRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const { selectedRunIds } = controller;

  // The dropdown hangs over the top of the page, where the line being formatted often sits.
  const clearSelectedText = useCallback(() => {
    requestAnimationFrame(() => {
      const anchor = targetRef.current?.getBoundingClientRect();
      const dropdown = dropdownRef.current?.getBoundingClientRect();
      if (!anchor || !dropdown) return;
      const selected = selectedRunIds.flatMap((id) => {
        const el = document.querySelector(`[data-run-id="${CSS.escape(id)}"]`);
        return el ? [el.getBoundingClientRect()] : [];
      });
      setOffset(
        offsetClearing(
          anchor.bottom,
          {
            left: anchor.left,
            right: anchor.left + dropdown.width,
            height: dropdown.height,
          },
          selected,
          FORMAT_MENU_GAP,
          window.innerHeight,
        ),
      );
    });
  }, [selectedRunIds]);

  return (
    <Popover
      position="bottom-start"
      withinPortal
      shadow="md"
      offset={offset}
      onOpen={clearSelectedText}
      onClose={() => setOffset(FORMAT_MENU_GAP)}
    >
      <Popover.Target>
        <Button
          ref={targetRef}
          size="sm"
          variant="tertiary"
          accent="neutral"
          aria-label={t("pdfTextEditor.toolbar.formatting", "Text formatting")}
          data-testid="pdf-editor-format-menu"
          style={NO_SHRINK}
          leftSection={<Icon name="case-sensitive" size={20} />}
        />
      </Popover.Target>
      <Popover.Dropdown ref={dropdownRef}>
        <Group gap="xs" wrap="wrap" maw={320}>
          <FormatGroup controller={controller} inPopover />
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

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
  /** Controls at the bar's end, before help. */
  trail?: ReactNode;
  /** False during an accessibility review: the bar keeps only undo, redo and its trail. */
  editing: boolean;
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
  trail,
  editing,
}: EditorTopBarProps) {
  const { t } = useTranslation();
  const session = useEditorSession();
  const hasSelection = controller.selectionCount > 0;
  const barRef = useRef<HTMLDivElement | null>(null);
  const barWidth = useElementWidth(barRef);
  const compact = barWidth !== null && barWidth < COMPACT_BELOW_PX;
  const bandRef = useRef<HTMLDivElement | null>(null);
  // The bar width the formatting controls need inline; 0 until they are seen not to fit.
  const [formatNeeds, setFormatNeeds] = useState(0);
  const foldFormat = compact || (barWidth !== null && barWidth < formatNeeds);
  const formatShape = [
    controller.hasRunSelection,
    controller.hasImageSelection,
    controller.state.weights.length > 0,
  ].join();
  // Other controls may fit again; measuring them inline happens before paint.
  useLayoutEffect(() => setFormatNeeds(0), [formatShape]);
  // The controls can grow after they mount (the device-fonts button, a loader), which re-renders only them.
  const [formatGroup, setFormatGroup] = useState<HTMLDivElement | null>(null);
  const [formatWidth, setFormatWidth] = useState(0);
  useEffect(() => {
    if (!formatGroup || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setFormatWidth(entry.contentRect.width),
    );
    observer.observe(formatGroup);
    return () => observer.disconnect();
  }, [formatGroup]);
  useLayoutEffect(() => {
    const band = bandRef.current;
    if (!band || barWidth === null || foldFormat || !hasSelection) return;
    // The colour field widens while its picker is open; folding then would
    // remount the controls and close the picker under the pointer.
    if (formatGroup?.querySelector('[aria-expanded="true"]')) return;
    const overflow = band.scrollWidth - band.clientWidth;
    if (overflow > 0) setFormatNeeds(Math.ceil(barWidth + overflow));
  }, [
    barWidth,
    foldFormat,
    hasSelection,
    formatGroup,
    formatWidth,
    formatShape,
  ]);

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
      <div className="pdf-editor-topbar__band" ref={bandRef}>
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

        {editing && (
          <>
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
                <Tooltip
                  label={t("pdfTextEditor.sidebar.addImage", "Add image")}
                >
                  <Button
                    size="sm"
                    variant="tertiary"
                    accent="neutral"
                    leftSection={<Icon name="image" size={20} />}
                    onClick={() => session?.pickImage()}
                    disabled={!session || !hasDocument}
                    aria-label={t(
                      "pdfTextEditor.sidebar.addImage",
                      "Add image",
                    )}
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
                {foldFormat ? (
                  <FormatMenu controller={controller} />
                ) : (
                  <div
                    className="pdf-editor-topbar__format"
                    ref={setFormatGroup}
                  >
                    <FormatGroup controller={controller} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="pdf-editor-topbar__trail">
        {trail}
        {editing && !compact && (
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
