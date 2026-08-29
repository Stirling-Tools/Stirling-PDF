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
import ImageIcon from "@mui/icons-material/ImageOutlined";
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
// LinearScale stands in for "distribute" since MUI Material doesn't ship a
// dedicated DistributeHorizontally / DistributeVertically icon.
import LinearScaleIcon from "@mui/icons-material/LinearScaleOutlined";
import RotateLeftIcon from "@mui/icons-material/RotateLeftOutlined";
import RotateRightIcon from "@mui/icons-material/RotateRightOutlined";
import FlipIcon from "@mui/icons-material/FlipOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseCssColor,
  toCssHex,
} from "@app/tools/pdfTextEditor/v2/model/Color";
import type { ToolbarState } from "@app/tools/pdfTextEditor/v2/types";
import { familyOf } from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import { FontFamilySelect } from "@app/tools/pdfTextEditor/v2/components/FontFamilySelect";

export type ChangeCaseMode = "upper" | "lower" | "title" | "sentence";
export type AlignMode =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "middle-v"
  | "bottom";
export type ZOrderToolbarMode = "to-front" | "to-back" | "forward" | "backward";
export type ImageTransformToolbarMode =
  | "rotate-cw"
  | "rotate-ccw"
  | "flip-h"
  | "flip-v";

interface ToolbarProps {
  state: ToolbarState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChangeFontSize: (size: number) => void;
  onChangeFill: (hex: string) => void;
  /** Null colour clears the outline; width 0 does the same. */
  onChangeOutline: (hex: string | null, width: number) => void;
  onChangeFontFamily: (family: string) => void;
  onToggleItalic: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onChangeCase: (mode: ChangeCaseMode) => void;
  onChangeZOrder: (mode: ZOrderToolbarMode) => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onTransformImage: (mode: ImageTransformToolbarMode) => void;
  /** Swap the selected image's pixels, keeping its placement. */
  onReplaceImage: () => void;
  /** Hand the selected image to another app and re-import its saves. */
  onEditImageExternally: () => void;
  /** False where the browser cannot write a file the user then edits. */
  externalEditSupported: boolean;
  /** True when every selected run/image is currently locked. */
  selectionAllLocked: boolean;
  /** True when at least one text run is selected. Disables case + lock-for-runs when false. */
  hasRunSelection: boolean;
  /** True when at least one image is selected. Gates rotate/flip buttons. */
  hasImageSelection: boolean;
  /** Count of selected objects (runs + images). 0/1 disables align; <3 disables distribute. */
  selectionCount: number;
  /** True when exactly one multi-line paragraph is selected - enables the
   * horizontal aligns (left/centre/right) to align that paragraph's lines. */
  canAlignLines: boolean;
  disabled: boolean;
}

function ToolbarSeparator() {
  return (
    <Text size="sm" c="dimmed" aria-hidden>
      |
    </Text>
  );
}

export function Toolbar({
  state,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onChangeFontSize,
  onChangeFill,
  onChangeOutline,
  onChangeFontFamily,
  onToggleItalic,
  onDelete,
  onToggleLock,
  onChangeCase,
  onChangeZOrder,
  onAlign,
  onDistribute,
  onTransformImage,
  onReplaceImage,
  onEditImageExternally,
  externalEditSupported,
  selectionAllLocked,
  hasRunSelection,
  hasImageSelection,
  selectionCount,
  canAlignLines,
  disabled,
}: ToolbarProps) {
  const { t } = useTranslation();
  // Mantine only closes the fill picker's dropdown on blur, and it is
  // portalled over the page - so we drive it and close it on a commit.
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  const imageDisabled = disabled || !hasImageSelection;
  // Vertical aligns + distribute need 2+ objects. Horizontal aligns also
  // accept a single multi-line paragraph (aligns its lines to each other).
  const alignDisabled = disabled || selectionCount < 2;
  const hAlignDisabled = disabled || (selectionCount < 2 && !canAlignLines);
  const distributeDisabled = disabled || selectionCount < 3;
  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
  const outlineHex = state.stroke ? toCssHex(state.stroke) : "#000000";
  const outlineWidth = state.strokeWidth ?? 0;
  // Every id form ends in the family, "pdf:<ptr>:<family>" included - the picker
  // needs that name, not the id, to be able to name an embedded face at all.
  const fontFamily = state.fontFamily ? familyOf(state.fontFamily) : null;
  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
      }}
      data-testid="v2-toolbar"
    >
      <Tooltip
        label={t("pdfTextEditorV2.toolbar.undoTooltip", "Undo (Ctrl+Z)")}
      >
        <Button
          variant="tertiary"
          size="sm"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("pdfTextEditorV2.toolbar.undo", "Undo")}
          data-testid="v2-undo"
          leftSection={<UndoIcon fontSize="small" />}
        />
      </Tooltip>
      <Tooltip
        label={t("pdfTextEditorV2.toolbar.redoTooltip", "Redo (Ctrl+Y)")}
      >
        <Button
          variant="tertiary"
          size="sm"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("pdfTextEditorV2.toolbar.redo", "Redo")}
          data-testid="v2-redo"
          leftSection={<RedoIcon fontSize="small" />}
        />
      </Tooltip>
      <ToolbarSeparator />
      <FontFamilySelect
        value={fontFamily}
        onChange={onChangeFontFamily}
        mixed={state.mixed.fontFamily}
        disabled={disabled || !hasRunSelection}
      />
      <NumberInput
        size="xs"
        w={72}
        min={4}
        max={144}
        // Blank rather than a made-up number when the runs disagree, but still
        // editable: typing a size is how you make a mixed selection uniform.
        value={state.mixed.fontSize ? "" : (state.fontSize ?? 12)}
        placeholder={
          state.mixed.fontSize
            ? t("pdfTextEditorV2.fontPicker.mixed", "Mixed")
            : undefined
        }
        onChange={(value) => {
          const next = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(next) && next > 0) onChangeFontSize(next);
        }}
        disabled={disabled || !hasRunSelection}
        aria-label={t("pdfTextEditorV2.toolbar.fontSize", "Font size")}
        data-testid="v2-font-size"
      />
      <ColorInput
        size="xs"
        w={132}
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
        // Enabled for MIXED fills (state.fill null) on purpose: picking a
        // colour is the only way to unify a multi-colour selection.
        disabled={disabled || !hasRunSelection}
        aria-label={t("pdfTextEditorV2.toolbar.fontColour", "Font colour")}
        data-testid="v2-colour"
      />
      <Popover position="bottom-start" withinPortal shadow="md">
        <Popover.Target>
          <Tooltip
            label={t(
              "pdfTextEditorV2.toolbar.advancedColourTooltip",
              "Advanced colour (glyph outline)",
            )}
          >
            <Button
              variant={outlineWidth > 0 ? "primary" : "tertiary"}
              size="sm"
              disabled={disabled || !hasRunSelection}
              aria-label={t(
                "pdfTextEditorV2.toolbar.advancedColour",
                "Advanced colour",
              )}
              data-testid="v2-colour-advanced"
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
              disabled={disabled || !hasRunSelection}
              aria-label={t(
                "pdfTextEditorV2.toolbar.outlineColour",
                "Outline colour",
              )}
              data-testid="v2-outline-colour"
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
              disabled={
                disabled || !hasRunSelection || state.strokeWidth === null
              }
              aria-label={t(
                "pdfTextEditorV2.toolbar.outlineWidth",
                "Outline width (0 = none)",
              )}
              data-testid="v2-outline-width"
            />
          </Group>
        </Popover.Dropdown>
      </Popover>
      <Tooltip
        label={
          hasRunSelection && !state.canItalic
            ? t(
                "pdfTextEditorV2.toolbar.italicUnavailable",
                "This font has no italic version. Load your device fonts or pick another font family.",
              )
            : t("pdfTextEditorV2.toolbar.italic", "Italic")
        }
      >
        <Button
          variant={state.italic ? "primary" : "tertiary"}
          size="sm"
          onClick={onToggleItalic}
          disabled={disabled || !hasRunSelection || !state.canItalic}
          aria-label={t("pdfTextEditorV2.toolbar.italic", "Italic")}
          data-testid="v2-italic"
          leftSection={<FormatItalicIcon fontSize="small" />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip
            label={t(
              "pdfTextEditorV2.toolbar.changeCaseTooltip",
              "Change case (text runs only)",
            )}
          >
            <Button
              variant="tertiary"
              size="sm"
              disabled={disabled || !hasRunSelection}
              aria-label={t(
                "pdfTextEditorV2.toolbar.changeCase",
                "Change case",
              )}
              data-testid="v2-change-case"
              leftSection={<TextFieldsIcon fontSize="small" />}
            />
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            data-testid="v2-change-case-upper"
            onClick={() => onChangeCase("upper")}
          >
            {t("pdfTextEditorV2.toolbar.caseUpper", "UPPERCASE")}
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-lower"
            onClick={() => onChangeCase("lower")}
          >
            {t("pdfTextEditorV2.toolbar.caseLower", "lowercase")}
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-title"
            onClick={() => onChangeCase("title")}
          >
            {t("pdfTextEditorV2.toolbar.caseTitle", "Title Case")}
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-sentence"
            onClick={() => onChangeCase("sentence")}
          >
            {t("pdfTextEditorV2.toolbar.caseSentence", "Sentence case")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ToolbarSeparator />
      <Tooltip
        label={
          selectionAllLocked
            ? t(
                "pdfTextEditorV2.toolbar.unlockTooltip",
                "Unlock selection - makes it editable again",
              )
            : t(
                "pdfTextEditorV2.toolbar.lockTooltip",
                "Lock selection - prevents accidental edits",
              )
        }
      >
        <Button
          variant={selectionAllLocked ? "primary" : "tertiary"}
          size="sm"
          onClick={onToggleLock}
          disabled={disabled}
          aria-label={
            selectionAllLocked
              ? t("pdfTextEditorV2.toolbar.unlock", "Unlock selection")
              : t("pdfTextEditorV2.toolbar.lock", "Lock selection")
          }
          data-testid="v2-toggle-lock"
          leftSection={
            selectionAllLocked ? (
              <LockIcon fontSize="small" />
            ) : (
              <LockOpenIcon fontSize="small" />
            )
          }
        />
      </Tooltip>
      <Tooltip
        label={t("pdfTextEditorV2.toolbar.deleteTooltip", "Delete (Del)")}
      >
        <Button
          variant="tertiary"
          accent="danger"
          size="sm"
          onClick={onDelete}
          disabled={disabled}
          aria-label={t("pdfTextEditorV2.toolbar.delete", "Delete selected")}
          data-testid="v2-delete"
          leftSection={<DeleteIcon fontSize="small" />}
        />
      </Tooltip>
      <ToolbarSeparator />
      {/* Arrange groups the object-level z-order, align and distribute
          controls behind one menu so the strip stays compact. Align needs
          2+ objects (or a multi-line paragraph); distribute needs 3+. */}
      <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
        <Menu.Target>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<LayersIcon fontSize="small" />}
            rightSection={<ExpandMoreIcon fontSize="small" />}
            disabled={disabled}
            data-testid="v2-arrange-menu"
          >
            {t("pdfTextEditorV2.toolbar.arrange", "Arrange")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{t("pdfTextEditorV2.toolbar.order", "Order")}</Menu.Label>
          <Menu.Item
            leftSection={<FlipToFrontIcon fontSize="small" />}
            onClick={() => onChangeZOrder("to-front")}
            data-testid="v2-z-to-front"
          >
            {t("pdfTextEditorV2.toolbar.bringToFront", "Bring to front")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowUpwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("forward")}
            data-testid="v2-z-forward"
          >
            {t("pdfTextEditorV2.toolbar.bringForward", "Bring forward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<ArrowDownwardIcon fontSize="small" />}
            onClick={() => onChangeZOrder("backward")}
            data-testid="v2-z-backward"
          >
            {t("pdfTextEditorV2.toolbar.sendBackward", "Send backward")}
          </Menu.Item>
          <Menu.Item
            leftSection={<FlipToBackIcon fontSize="small" />}
            onClick={() => onChangeZOrder("to-back")}
            data-testid="v2-z-to-back"
          >
            {t("pdfTextEditorV2.toolbar.sendToBack", "Send to back")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t(
              "pdfTextEditorV2.toolbar.alignLabel",
              "Align · needs 2+ objects",
            )}
          </Menu.Label>
          <Menu.Item
            leftSection={<AlignHorizontalLeftIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("left")}
            data-testid="v2-align-left"
          >
            {t("pdfTextEditorV2.toolbar.alignLeft", "Align left")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalCenterIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("center-h")}
            data-testid="v2-align-center-h"
          >
            {t("pdfTextEditorV2.toolbar.alignCentre", "Align centre")}
          </Menu.Item>
          <Menu.Item
            leftSection={<AlignHorizontalRightIcon fontSize="small" />}
            disabled={hAlignDisabled}
            onClick={() => onAlign("right")}
            data-testid="v2-align-right"
          >
            {t("pdfTextEditorV2.toolbar.alignRight", "Align right")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignTopIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("top")}
            data-testid="v2-align-top"
          >
            {t("pdfTextEditorV2.toolbar.alignTop", "Align top")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignCenterIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("middle-v")}
            data-testid="v2-align-middle-v"
          >
            {t("pdfTextEditorV2.toolbar.alignMiddle", "Align middle")}
          </Menu.Item>
          <Menu.Item
            leftSection={<VerticalAlignBottomIcon fontSize="small" />}
            disabled={alignDisabled}
            onClick={() => onAlign("bottom")}
            data-testid="v2-align-bottom"
          >
            {t("pdfTextEditorV2.toolbar.alignBottom", "Align bottom")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>
            {t(
              "pdfTextEditorV2.toolbar.distributeLabel",
              "Distribute · needs 3+ objects",
            )}
          </Menu.Label>
          <Menu.Item
            leftSection={<LinearScaleIcon fontSize="small" />}
            disabled={distributeDisabled}
            onClick={() => onDistribute("horizontal")}
            data-testid="v2-distribute-h"
          >
            {t(
              "pdfTextEditorV2.toolbar.distributeHorizontally",
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
            data-testid="v2-distribute-v"
          >
            {t(
              "pdfTextEditorV2.toolbar.distributeVertically",
              "Distribute vertically",
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {/* Image transforms only apply to a selected image. The menu opens
          whenever something is selected; if it isn't an image, the items are
          disabled and a label explains why (reachable, unlike a tooltip on a
          disabled button). */}
      <Menu shadow="md" position="bottom-start" withinPortal closeOnItemClick>
        <Menu.Target>
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            leftSection={<ImageIcon fontSize="small" />}
            rightSection={<ExpandMoreIcon fontSize="small" />}
            disabled={disabled}
            data-testid="v2-imgop-menu"
          >
            {t("pdfTextEditorV2.toolbar.image", "Image")}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {!hasImageSelection && (
            <Menu.Label>
              {t(
                "pdfTextEditorV2.toolbar.selectImageFirst",
                "Select an image first",
              )}
            </Menu.Label>
          )}
          <Menu.Item
            leftSection={<RotateLeftIcon fontSize="small" />}
            disabled={imageDisabled}
            onClick={() => onTransformImage("rotate-ccw")}
            data-testid="v2-imgop-rotate-ccw"
          >
            {t("pdfTextEditorV2.toolbar.rotateLeft", "Rotate 90° left")}
          </Menu.Item>
          <Menu.Item
            leftSection={<RotateRightIcon fontSize="small" />}
            disabled={imageDisabled}
            onClick={() => onTransformImage("rotate-cw")}
            data-testid="v2-imgop-rotate-cw"
          >
            {t("pdfTextEditorV2.toolbar.rotateRight", "Rotate 90° right")}
          </Menu.Item>
          <Menu.Item
            leftSection={<FlipIcon fontSize="small" />}
            disabled={imageDisabled}
            onClick={() => onTransformImage("flip-h")}
            data-testid="v2-imgop-flip-h"
          >
            {t("pdfTextEditorV2.toolbar.flipHorizontal", "Flip horizontal")}
          </Menu.Item>
          <Menu.Item
            leftSection={
              <FlipIcon
                fontSize="small"
                style={{ transform: "rotate(90deg)" }}
              />
            }
            disabled={imageDisabled}
            onClick={() => onTransformImage("flip-v")}
            data-testid="v2-imgop-flip-v"
          >
            {t("pdfTextEditorV2.toolbar.flipVertical", "Flip vertical")}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<ImageIcon fontSize="small" />}
            disabled={imageDisabled}
            onClick={onReplaceImage}
            data-testid="v2-imgop-replace"
          >
            {t(
              "pdfTextEditorV2.toolbar.replaceImage",
              "Replace, keeping placement",
            )}
          </Menu.Item>
          <Menu.Item
            leftSection={<OpenInNewIcon fontSize="small" />}
            disabled={imageDisabled || !externalEditSupported}
            onClick={onEditImageExternally}
            data-testid="v2-imgop-edit-externally"
          >
            {t(
              "pdfTextEditorV2.toolbar.editImageExternally",
              "Edit in another app",
            )}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
