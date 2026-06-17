import {
  ActionIcon,
  ColorInput,
  Group,
  Menu,
  NumberInput,
  Select,
  Text,
  Tooltip,
} from "@mantine/core";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import LockIcon from "@mui/icons-material/LockOutlined";
import LockOpenIcon from "@mui/icons-material/LockOpenOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import FlipToFrontIcon from "@mui/icons-material/FlipToFrontOutlined";
import FlipToBackIcon from "@mui/icons-material/FlipToBackOutlined";
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
  disabled,
}: ToolbarProps) {
  const imageDisabled = disabled || !hasImageSelection;
  const alignDisabled = disabled || selectionCount < 2;
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
      gap="sm"
      px="md"
      py="xs"
      style={{
        borderBottom: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
      }}
      data-testid="v2-toolbar"
    >
      <Tooltip label="Undo (Ctrl+Z)">
        <ActionIcon
          variant="subtle"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          data-testid="v2-undo"
        >
          <UndoIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Redo (Ctrl+Y)">
        <ActionIcon
          variant="subtle"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          data-testid="v2-redo"
        >
          <RedoIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Text size="sm" c="dimmed">
        |
      </Text>
      <NumberInput
        size="xs"
        w={88}
        min={4}
        max={144}
        value={state.fontSize ?? 12}
        onChange={(value) => {
          const next = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(next) && next > 0) onChangeFontSize(next);
        }}
        disabled={disabled || state.fontSize === null}
        aria-label="Font size"
        data-testid="v2-font-size"
      />
      <ColorInput
        size="xs"
        w={140}
        value={fillHex}
        onChange={(next) => {
          if (!next) return;
          if (parseCssColor(next)) onChangeFill(next);
        }}
        disabled={disabled || !state.fill}
        aria-label="Font colour"
        data-testid="v2-colour"
      />
      <Select
        size="xs"
        w={160}
        placeholder="Font family"
        aria-label="Font family"
        data-testid="v2-font-family"
        data={FONT_FAMILIES}
        value={fontValue}
        onChange={(value) => {
          if (value) onChangeFontFamily(value);
        }}
        disabled={disabled}
      />
      <Tooltip label="Bold">
        <ActionIcon
          variant={state.bold ? "filled" : "subtle"}
          onClick={onToggleBold}
          disabled={disabled}
          aria-label="Bold"
          data-testid="v2-bold"
        >
          <FormatBoldIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Italic">
        <ActionIcon
          variant={state.italic ? "filled" : "subtle"}
          onClick={onToggleItalic}
          disabled={disabled}
          aria-label="Italic"
          data-testid="v2-italic"
        >
          <FormatItalicIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip label="Change case (text runs only)">
            <ActionIcon
              variant="subtle"
              disabled={disabled || !hasRunSelection}
              aria-label="Change case"
              data-testid="v2-change-case"
            >
              <TextFieldsIcon fontSize="small" />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            data-testid="v2-change-case-upper"
            onClick={() => onChangeCase("upper")}
          >
            UPPERCASE
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-lower"
            onClick={() => onChangeCase("lower")}
          >
            lowercase
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-title"
            onClick={() => onChangeCase("title")}
          >
            Title Case
          </Menu.Item>
          <Menu.Item
            data-testid="v2-change-case-sentence"
            onClick={() => onChangeCase("sentence")}
          >
            Sentence case
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Tooltip
        label={
          selectionAllLocked
            ? "Unlock selection - makes it editable again"
            : "Lock selection - prevents accidental edits"
        }
      >
        <ActionIcon
          variant={selectionAllLocked ? "filled" : "subtle"}
          onClick={onToggleLock}
          disabled={disabled}
          aria-label={
            selectionAllLocked ? "Unlock selection" : "Lock selection"
          }
          data-testid="v2-toggle-lock"
        >
          {selectionAllLocked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )}
        </ActionIcon>
      </Tooltip>
      <Text size="sm" c="dimmed">
        |
      </Text>
      <Tooltip label="Bring to front (top of stack)">
        <ActionIcon
          variant="subtle"
          onClick={() => onChangeZOrder("to-front")}
          disabled={disabled}
          aria-label="Bring to front"
          data-testid="v2-z-to-front"
        >
          <FlipToFrontIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Send to back (bottom of stack)">
        <ActionIcon
          variant="subtle"
          onClick={() => onChangeZOrder("to-back")}
          disabled={disabled}
          aria-label="Send to back"
          data-testid="v2-z-to-back"
        >
          <FlipToBackIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Bring forward one step">
        <ActionIcon
          variant="subtle"
          onClick={() => onChangeZOrder("forward")}
          disabled={disabled}
          aria-label="Bring forward"
          data-testid="v2-z-forward"
        >
          <Text size="xs">↑</Text>
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Send backward one step">
        <ActionIcon
          variant="subtle"
          onClick={() => onChangeZOrder("backward")}
          disabled={disabled}
          aria-label="Send backward"
          data-testid="v2-z-backward"
        >
          <Text size="xs">↓</Text>
        </ActionIcon>
      </Tooltip>
      <Text size="sm" c="dimmed">
        |
      </Text>
      <Tooltip label="Align left edges (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("left")}
          disabled={alignDisabled}
          aria-label="Align left"
          data-testid="v2-align-left"
        >
          <AlignHorizontalLeftIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Align horizontal centres (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("center-h")}
          disabled={alignDisabled}
          aria-label="Align horizontal center"
          data-testid="v2-align-center-h"
        >
          <AlignHorizontalCenterIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Align right edges (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("right")}
          disabled={alignDisabled}
          aria-label="Align right"
          data-testid="v2-align-right"
        >
          <AlignHorizontalRightIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Align top edges (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("top")}
          disabled={alignDisabled}
          aria-label="Align top"
          data-testid="v2-align-top"
        >
          <VerticalAlignTopIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Align vertical middles (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("middle-v")}
          disabled={alignDisabled}
          aria-label="Align vertical middle"
          data-testid="v2-align-middle-v"
        >
          <VerticalAlignCenterIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Align bottom edges (select 2+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onAlign("bottom")}
          disabled={alignDisabled}
          aria-label="Align bottom"
          data-testid="v2-align-bottom"
        >
          <VerticalAlignBottomIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Distribute horizontally (select 3+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onDistribute("horizontal")}
          disabled={distributeDisabled}
          aria-label="Distribute horizontally"
          data-testid="v2-distribute-h"
        >
          <LinearScaleIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Distribute vertically (select 3+)">
        <ActionIcon
          variant="subtle"
          onClick={() => onDistribute("vertical")}
          disabled={distributeDisabled}
          aria-label="Distribute vertically"
          data-testid="v2-distribute-v"
        >
          <LinearScaleIcon
            fontSize="small"
            style={{ transform: "rotate(90deg)" }}
          />
        </ActionIcon>
      </Tooltip>
      <Text size="sm" c="dimmed">
        |
      </Text>
      <Tooltip label="Rotate image 90° counter-clockwise (image selected)">
        <ActionIcon
          variant="subtle"
          onClick={() => onTransformImage("rotate-ccw")}
          disabled={imageDisabled}
          aria-label="Rotate image counter-clockwise"
          data-testid="v2-image-rotate-ccw"
        >
          <RotateLeftIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Rotate image 90° clockwise (image selected)">
        <ActionIcon
          variant="subtle"
          onClick={() => onTransformImage("rotate-cw")}
          disabled={imageDisabled}
          aria-label="Rotate image clockwise"
          data-testid="v2-image-rotate-cw"
        >
          <RotateRightIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Flip image horizontally (image selected)">
        <ActionIcon
          variant="subtle"
          onClick={() => onTransformImage("flip-h")}
          disabled={imageDisabled}
          aria-label="Flip image horizontally"
          data-testid="v2-image-flip-h"
        >
          <FlipIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Flip image vertically (image selected)">
        <ActionIcon
          variant="subtle"
          onClick={() => onTransformImage("flip-v")}
          disabled={imageDisabled}
          aria-label="Flip image vertically"
          data-testid="v2-image-flip-v"
        >
          <FlipIcon fontSize="small" style={{ transform: "rotate(90deg)" }} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Delete (Del)">
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={onDelete}
          disabled={disabled}
          aria-label="Delete selected"
          data-testid="v2-delete"
        >
          <DeleteIcon fontSize="small" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
