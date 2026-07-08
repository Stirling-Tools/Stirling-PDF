import {
  ColorInput,
  Group,
  Menu,
  NumberInput,
  Select,
  Text,
  Tooltip,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
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
// LinearScale stands in for "distribute" since MUI Material doesn't ship
// a dedicated DistributeHorizontally / DistributeVertically icon. Rotating
// it for the vertical case keeps the two buttons visually distinguishable.
import LinearScaleIcon from "@mui/icons-material/LinearScaleOutlined";
import RotateLeftIcon from "@mui/icons-material/RotateLeftOutlined";
import RotateRightIcon from "@mui/icons-material/RotateRightOutlined";
import FlipIcon from "@mui/icons-material/FlipOutlined";
import { useTranslation } from "react-i18next";
import {
  parseCssColor,
  toCssHex,
} from "@app/tools/pdfTextEditor/v2/model/Color";
import type { ToolbarState } from "@app/tools/pdfTextEditor/v2/types";

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
  onChangeFontFamily: (family: string) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onChangeCase: (mode: ChangeCaseMode) => void;
  onChangeZOrder: (mode: ZOrderToolbarMode) => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onTransformImage: (mode: ImageTransformToolbarMode) => void;
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

const FONT_FAMILIES: { value: string; label: string }[] = [
  { value: "Helvetica", label: "Helvetica" },
  { value: "Helvetica-Bold", label: "Helvetica Bold" },
  { value: "Times-Roman", label: "Times Roman" },
  { value: "Times-Bold", label: "Times Bold" },
  { value: "Times-Italic", label: "Times Italic" },
  { value: "Courier", label: "Courier" },
  { value: "Courier-Bold", label: "Courier Bold" },
];

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
  onChangeFontFamily,
  onToggleBold,
  onToggleItalic,
  onDelete,
  onToggleLock,
  onChangeCase,
  onChangeZOrder,
  onAlign,
  onDistribute,
  onTransformImage,
  selectionAllLocked,
  hasRunSelection,
  hasImageSelection,
  selectionCount,
  canAlignLines,
  disabled,
}: ToolbarProps) {
  const { t } = useTranslation();
  const imageDisabled = disabled || !hasImageSelection;
  // Vertical aligns + distribute need 2+ objects. Horizontal aligns also
  // accept a single multi-line paragraph (aligns its lines to each other).
  const alignDisabled = disabled || selectionCount < 2;
  const hAlignDisabled = disabled || (selectionCount < 2 && !canAlignLines);
  const distributeDisabled = disabled || selectionCount < 3;
  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
  // Reflect the selection's font in the Select instead of always showing the
  // placeholder. Only base-14 families map to an option; embedded/subset
  // fonts (and mixed selections) have no matching entry, so show placeholder.
  const fontValue = (() => {
    const id = state.fontFamily;
    if (!id || state.mixed.fontFamily) return null;
    const family = id.startsWith("base14:") ? id.slice("base14:".length) : id;
    return FONT_FAMILIES.some((f) => f.value === family) ? family : null;
  })();
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
      <Select
        size="xs"
        w={150}
        placeholder={t("pdfTextEditorV2.toolbar.fontFamily", "Font family")}
        aria-label={t("pdfTextEditorV2.toolbar.fontFamily", "Font family")}
        data-testid="v2-font-family"
        data={FONT_FAMILIES}
        value={fontValue}
        onChange={(value) => {
          if (value) onChangeFontFamily(value);
        }}
        disabled={disabled}
      />
      <NumberInput
        size="xs"
        w={72}
        min={4}
        max={144}
        value={state.fontSize ?? 12}
        onChange={(value) => {
          const next = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(next) && next > 0) onChangeFontSize(next);
        }}
        disabled={disabled || state.fontSize === null}
        aria-label={t("pdfTextEditorV2.toolbar.fontSize", "Font size")}
        data-testid="v2-font-size"
      />
      <ColorInput
        size="xs"
        w={132}
        value={fillHex}
        onChange={(next) => {
          if (!next) return;
          if (parseCssColor(next)) onChangeFill(next);
        }}
        disabled={disabled || !state.fill}
        aria-label={t("pdfTextEditorV2.toolbar.fontColour", "Font colour")}
        data-testid="v2-colour"
      />
      <Tooltip label={t("pdfTextEditorV2.toolbar.bold", "Bold")}>
        <Button
          variant={state.bold ? "primary" : "tertiary"}
          size="sm"
          onClick={onToggleBold}
          disabled={disabled}
          aria-label={t("pdfTextEditorV2.toolbar.bold", "Bold")}
          data-testid="v2-bold"
          leftSection={<FormatBoldIcon fontSize="small" />}
        />
      </Tooltip>
      <Tooltip label={t("pdfTextEditorV2.toolbar.italic", "Italic")}>
        <Button
          variant={state.italic ? "primary" : "tertiary"}
          size="sm"
          onClick={onToggleItalic}
          disabled={disabled}
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
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
