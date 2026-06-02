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
import {
  parseCssColor,
  toCssHex,
} from "@app/tools/pdfTextEditor/v2/model/Color";
import type { ToolbarState } from "@app/tools/pdfTextEditor/v2/types";

export type ChangeCaseMode = "upper" | "lower" | "title" | "sentence";

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
  /** True when every selected run/image is currently locked. */
  selectionAllLocked: boolean;
  /** True when at least one text run is selected. Disables case + lock-for-runs when false. */
  hasRunSelection: boolean;
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
  selectionAllLocked,
  hasRunSelection,
  disabled,
}: ToolbarProps) {
  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
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
        value={null}
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
