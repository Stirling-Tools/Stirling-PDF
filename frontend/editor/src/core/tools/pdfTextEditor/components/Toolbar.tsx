import { useState } from "react";
import {
  ColorInput,
  Group,
  Menu,
  NumberInput,
  Popover,
  Text,
  Tooltip,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import TuneIcon from "@mui/icons-material/TuneOutlined";
import LockIcon from "@mui/icons-material/LockOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpenOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LayersIcon from "@mui/icons-material/LayersOutlined";
import FlipToFrontIcon from "@mui/icons-material/FlipToFrontOutlined";
import FlipToBackIcon from "@mui/icons-material/FlipToBackOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import VerticalAlignBottomIcon from "@mui/icons-material/VerticalAlignBottom";
import VerticalAlignCenterIcon from "@mui/icons-material/VerticalAlignCenter";
import AlignHorizontalLeftIcon from "@mui/icons-material/AlignHorizontalLeftOutlined";
import AlignHorizontalCenterIcon from "@mui/icons-material/AlignHorizontalCenterOutlined";
import AlignHorizontalRightIcon from "@mui/icons-material/AlignHorizontalRightOutlined";
import LinearScaleIcon from "@mui/icons-material/LinearScaleOutlined";
import { useTranslation } from "react-i18next";
import { parseCssColor, toCssHex } from "@app/tools/pdfTextEditor/model/Color";
import { familyOf } from "@app/tools/pdfTextEditor/util/fontFamily";
import { FontFamilySelect } from "@app/tools/pdfTextEditor/components/FontFamilySelect";
import type { useToolbarController } from "@app/tools/pdfTextEditor/hooks/useToolbarController";

type Controller = ReturnType<typeof useToolbarController>;

/**
 * The canvas toolbar: undo/redo, plus formatting for the current selection.
 *
 * Character formatting sits here rather than in the side panel because that is
 * where every document editor puts it. The group is *contextual* - it appears
 * with a selection instead of standing permanently greyed - which is what
 * keeps the strip to a single row.
 */
interface ToolbarProps {
  controller: Controller;
}

function ToolbarSeparator() {
  return (
    <Text size="sm" c="dimmed" aria-hidden style={NO_SHRINK}>
      |
    </Text>
  );
}

/** Toolbar children keep their natural width; the strip scrolls if pressed. */
const NO_SHRINK = { flexShrink: 0 } as const;

export function Toolbar({ controller }: ToolbarProps) {
  const { t } = useTranslation();
  const hasSelection = controller.selectionCount > 0;
  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      wrap="nowrap"
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
        // Scrolls rather than wraps: a second row was the old strip's failure
        // mode, and a wrapped toolbar hides controls without saying so.
        overflowX: "auto",
        scrollbarWidth: "thin",
      }}
      data-testid="pdf-editor-toolbar"
    >
      <Tooltip label={t("pdfTextEditor.toolbar.undoTooltip", "Undo (Ctrl+Z)")}>
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
      <Tooltip label={t("pdfTextEditor.toolbar.redoTooltip", "Redo (Ctrl+Y)")}>
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
      {hasSelection && (
        <>
          <ToolbarSeparator />
          <FormatGroup controller={controller} />
          <ToolbarSeparator />
          <ObjectGroup controller={controller} />
        </>
      )}
    </Group>
  );
}

/** Character formatting. Text runs only - absent for a pure image selection. */
function FormatGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const {
    state,
    hasRunSelection,
    onChangeFontFamily,
    onChangeFontSize,
    onChangeFill,
    onChangeOutline,
    onToggleItalic,
    onChangeCase,
  } = controller;
  // Mantine only closes the fill picker's dropdown on blur, and it is
  // portalled over the page - so we drive it and close it on a commit.
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  if (!hasRunSelection) return null;

  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
  const outlineHex = state.stroke ? toCssHex(state.stroke) : "#000000";
  const outlineWidth = state.strokeWidth ?? 0;
  const fontFamily = state.fontFamily ? familyOf(state.fontFamily) : null;

  return (
    <>
      <FontFamilySelect
        value={fontFamily}
        onChange={onChangeFontFamily}
        mixed={state.mixed.fontFamily}
      />
      <NumberInput
        size="xs"
        w={76}
        min={4}
        max={144}
        // A PDF font size is a float, so 11pt arrives as 11.000000002 and
        // rendered in full. One decimal is all a type size ever needs.
        decimalScale={1}
        // Blank rather than a made-up number when the runs disagree, but still
        // editable: typing a size is how you make a mixed selection uniform.
        value={
          state.mixed.fontSize
            ? ""
            : Math.round((state.fontSize ?? 12) * 10) / 10
        }
        placeholder={
          state.mixed.fontSize
            ? t("pdfTextEditor.fontPicker.mixed", "Mixed")
            : undefined
        }
        onChange={(value) => {
          const next = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(next) && next > 0) onChangeFontSize(next);
        }}
        aria-label={t("pdfTextEditor.toolbar.fontSize", "Font size")}
        data-testid="pdf-editor-font-size"
        style={NO_SHRINK}
      />
      <ColorInput
        size="xs"
        w={fillPickerOpen ? 116 : 74}
        withEyeDropper={false}
        styles={{
          // The swatch is decoration, not a target: left interactive it covers
          // the whole of a narrow input and swallows the click that opens the
          // picker. Clicks fall through to the input, which owns the gesture.
          section: { pointerEvents: "none" },
          input: {
            color: fillPickerOpen ? undefined : "transparent",
            transition: "width 120ms ease-out",
          },
        }}
        value={fillHex}
        // Blur re-emits the last valid colour, which re-applied the fill AFTER
        // an undo. The input is controlled, so there is nothing to fix up.
        fixOnBlur={false}
        onChange={(next) => {
          if (!next) return;
          const rgb = parseCssColor(next);
          if (!rgb) return;
          // Re-emitting the applied colour must not cost a second undo step.
          // Mixed fills (state.fill null) still apply - that unifies them.
          if (
            state.fill &&
            rgb.r === state.fill.r &&
            rgb.g === state.fill.g &&
            rgb.b === state.fill.b
          ) {
            return;
          }
          onChangeFill(next);
        }}
        // Drag end, swatch click or a committed hex - the deliberate pick.
        // Deferred a frame: a saturation-square pick delivers its value on the
        // NEXT animation frame (use-move), so closing now unmounts the picker
        // first and Firefox loses the pick against a detached 0x0 node.
        onChangeEnd={() =>
          window.requestAnimationFrame(() => setFillPickerOpen(false))
        }
        onFocus={() => setFillPickerOpen(true)}
        onClick={() => setFillPickerOpen(true)}
        onBlur={() => setFillPickerOpen(false)}
        onKeyDown={(event) => {
          // The dropdown's own Escape handler never sees the key - focus stays
          // in the input - so dismiss it here.
          if (event.key === "Escape" || event.key === "Enter") {
            setFillPickerOpen(false);
          }
        }}
        popoverProps={{
          opened: fillPickerOpen,
          onChange: setFillPickerOpen,
          transitionProps: { transition: "fade", duration: 0 },
        }}
        aria-label={t("pdfTextEditor.toolbar.fontColour", "Font colour")}
        data-testid="pdf-editor-colour"
        style={NO_SHRINK}
      />
      <Popover position="bottom-start" withinPortal shadow="md">
        <Popover.Target>
          <Tooltip
            label={t(
              "pdfTextEditor.toolbar.advancedColourTooltip",
              "Advanced colour (glyph outline)",
            )}
          >
            <Button
              variant={outlineWidth > 0 ? "primary" : "tertiary"}
              accent={outlineWidth > 0 ? "default" : "neutral"}
              size="sm"
              aria-label={t(
                "pdfTextEditor.toolbar.advancedColour",
                "Advanced colour",
              )}
              data-testid="pdf-editor-colour-advanced"
              style={NO_SHRINK}
              leftSection={<TuneIcon fontSize="small" />}
            />
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Group gap="xs" align="center" wrap="nowrap">
            <ColorInput
              size="xs"
              w={132}
              value={outlineHex}
              onChange={(next) => {
                if (!next || !parseCssColor(next)) return;
                // Picking a colour with no width yet is meant as "outline it",
                // so give it a visible default rather than a silent no-op.
                onChangeOutline(next, outlineWidth > 0 ? outlineWidth : 0.5);
              }}
              aria-label={t(
                "pdfTextEditor.toolbar.outlineColour",
                "Outline colour",
              )}
              data-testid="pdf-editor-outline-colour"
            />
            <NumberInput
              size="xs"
              w={76}
              min={0}
              max={12}
              step={0.25}
              decimalScale={2}
              value={outlineWidth}
              onChange={(value) => {
                const next = typeof value === "number" ? value : Number(value);
                if (!Number.isFinite(next) || next < 0) return;
                // With a mixed colour there is no single hex to apply, so only
                // the "remove the outline" direction is unambiguous.
                if (next > 0 && state.mixed.stroke) return;
                onChangeOutline(next > 0 ? outlineHex : null, next);
              }}
              disabled={state.strokeWidth === null}
              aria-label={t(
                "pdfTextEditor.toolbar.outlineWidth",
                "Outline width (0 = none)",
              )}
              data-testid="pdf-editor-outline-width"
            />
          </Group>
        </Popover.Dropdown>
      </Popover>
      <Tooltip
        label={
          !state.canItalic
            ? t(
                "pdfTextEditor.toolbar.italicUnavailable",
                "This font has no italic version. Load your device fonts or pick another font family.",
              )
            : t("pdfTextEditor.toolbar.italic", "Italic")
        }
      >
        <Button
          variant={state.italic ? "primary" : "tertiary"}
          accent={state.italic ? "default" : "neutral"}
          size="sm"
          onClick={onToggleItalic}
          disabled={!state.canItalic}
          aria-label={t("pdfTextEditor.toolbar.italic", "Italic")}
          data-testid="pdf-editor-italic"
          style={NO_SHRINK}
          leftSection={<FormatItalicIcon fontSize="small" />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip
            label={t(
              "pdfTextEditor.toolbar.changeCaseTooltip",
              "Change case (text runs only)",
            )}
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              aria-label={t("pdfTextEditor.toolbar.changeCase", "Change case")}
              data-testid="pdf-editor-change-case"
              style={NO_SHRINK}
              leftSection={<TextFieldsIcon fontSize="small" />}
            />
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            data-testid="pdf-editor-change-case-upper"
            onClick={() => onChangeCase("upper")}
          >
            {t("pdfTextEditor.toolbar.caseUpper", "UPPERCASE")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-lower"
            onClick={() => onChangeCase("lower")}
          >
            {t("pdfTextEditor.toolbar.caseLower", "lowercase")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-title"
            onClick={() => onChangeCase("title")}
          >
            {t("pdfTextEditor.toolbar.caseTitle", "Title Case")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-sentence"
            onClick={() => onChangeCase("sentence")}
          >
            {t("pdfTextEditor.toolbar.caseSentence", "Sentence case")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}

/** Verbs that apply to any object: lock, delete, and Arrange. */
function ObjectGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const {
    selectionAllLocked,
    onToggleLock,
    onDelete,
    onChangeZOrder,
    onAlign,
    onDistribute,
    selectionCount,
    canAlignLines,
  } = controller;
  // Vertical aligns + distribute need 2+ objects. Horizontal aligns also
  // accept a single multi-line paragraph (aligns its lines to each other).
  const alignDisabled = selectionCount < 2;
  const hAlignDisabled = selectionCount < 2 && !canAlignLines;
  const distributeDisabled = selectionCount < 3;

  return (
    <>
      <Tooltip
        label={
          selectionAllLocked
            ? t(
                "pdfTextEditor.toolbar.unlockTooltip",
                "Unlock selection - makes it editable again",
              )
            : t(
                "pdfTextEditor.toolbar.lockTooltip",
                "Lock selection - prevents accidental edits",
              )
        }
      >
        <Button
          variant={selectionAllLocked ? "primary" : "tertiary"}
          accent={selectionAllLocked ? "default" : "neutral"}
          size="sm"
          onClick={onToggleLock}
          aria-label={
            selectionAllLocked
              ? t("pdfTextEditor.toolbar.unlock", "Unlock selection")
              : t("pdfTextEditor.toolbar.lock", "Lock selection")
          }
          data-testid="pdf-editor-toggle-lock"
          style={NO_SHRINK}
          leftSection={
            selectionAllLocked ? (
              <LockIcon fontSize="small" />
            ) : (
              <LockOpenIcon fontSize="small" />
            )
          }
        />
      </Tooltip>
      <Tooltip label={t("pdfTextEditor.toolbar.deleteTooltip", "Delete (Del)")}>
        <Button
          variant="tertiary"
          accent="danger"
          size="sm"
          onClick={onDelete}
          aria-label={t("pdfTextEditor.toolbar.delete", "Delete selected")}
          data-testid="pdf-editor-delete"
          style={NO_SHRINK}
          leftSection={<DeleteIcon fontSize="small" />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
        <Menu.Target>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<LayersIcon fontSize="small" />}
            rightSection={<ExpandMoreIcon fontSize="small" />}
            data-testid="pdf-editor-arrange-menu"
            style={NO_SHRINK}
          >
            {t("pdfTextEditor.toolbar.arrange", "Arrange")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("pdfTextEditor.toolbar.order", "Order")}</Menu.Label>
          <Menu.Item
            leftSection={<FlipToFrontIcon fontSize="small" />}
            onClick={() => onChangeZOrder("to-front")}
            data-testid="pdf-editor-z-to-front"
          >
            {t("pdfTextEditor.toolbar.bringToFront", "Bring to front")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowUpwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("forward")}
            data-testid="pdf-editor-z-forward"
          >
            {t("pdfTextEditor.toolbar.bringForward", "Bring forward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowDownwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("backward")}
            data-testid="pdf-editor-z-backward"
          >
            {t("pdfTextEditor.toolbar.sendBackward", "Send backward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<FlipToBackIcon fontSize="small" />}
            onClick={() => onChangeZOrder("to-back")}
            data-testid="pdf-editor-z-to-back"
          >
            {t("pdfTextEditor.toolbar.sendToBack", "Send to back")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t("pdfTextEditor.toolbar.alignLabel", "Align · needs 2+ objects")}
          </Menu.Label>
          <Menu.Item
            leftSection={<AlignHorizontalLeftIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("left")}
            data-testid="pdf-editor-align-left"
          >
            {t("pdfTextEditor.toolbar.alignLeft", "Align left")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalCenterIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("center-h")}
            data-testid="pdf-editor-align-center-h"
          >
            {t("pdfTextEditor.toolbar.alignCentre", "Align centre")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalRightIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("right")}
            data-testid="pdf-editor-align-right"
          >
            {t("pdfTextEditor.toolbar.alignRight", "Align right")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignTopIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("top")}
            data-testid="pdf-editor-align-top"
          >
            {t("pdfTextEditor.toolbar.alignTop", "Align top")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignCenterIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("middle-v")}
            data-testid="pdf-editor-align-middle-v"
          >
            {t("pdfTextEditor.toolbar.alignMiddle", "Align middle")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignBottomIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("bottom")}
            data-testid="pdf-editor-align-bottom"
          >
            {t("pdfTextEditor.toolbar.alignBottom", "Align bottom")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t(
              "pdfTextEditor.toolbar.distributeLabel",
              "Distribute · needs 3+ objects",
            )}
          </Menu.Label>
          <Menu.Item
            leftSection={<LinearScaleIcon fontSize="small" />}
            disabled={distributeDisabled}
            onClick={() => onDistribute("horizontal")}
            data-testid="pdf-editor-distribute-h"
          >
            {t(
              "pdfTextEditor.toolbar.distributeHorizontally",
              "Distribute horizontally",
            )}
          </Menu.Item>
          <Menu.Item
            leftSection={
              <LinearScaleIcon
                fontSize="small"
                style={{ transform: "rotate(90deg)" }}
              />
            }
            disabled={distributeDisabled}
            onClick={() => onDistribute("vertical")}
            data-testid="pdf-editor-distribute-v"
          >
            {t(
              "pdfTextEditor.toolbar.distributeVertically",
              "Distribute vertically",
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
