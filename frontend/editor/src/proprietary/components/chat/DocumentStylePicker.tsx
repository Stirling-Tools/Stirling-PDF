import { useState } from "react";
import {
  ActionIcon,
  Box,
  ColorSwatch,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import PaletteIcon from "@mui/icons-material/Palette";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

export interface DocumentStyleSelection {
  primaryColor?: string;
  backgroundColor?: string;
  bodyTextColor?: string;
}

interface ColorPreset {
  color: string;
  name: string;
  /** For background presets: the body text colour that pairs well with this background. */
  textColor?: string;
}

const LIGHT_BACKGROUNDS: ColorPreset[] = [
  { color: "#ffffff", name: "White", textColor: "#1a1a1a" },
  { color: "#f8f9fa", name: "Light Gray", textColor: "#1a1a1a" },
  { color: "#fef9ef", name: "Cream", textColor: "#2d2416" },
  { color: "#f0f4ff", name: "Cool Blue", textColor: "#1a1a1a" },
  { color: "#f5fff5", name: "Soft Mint", textColor: "#1a2e1a" },
  { color: "#fff5f5", name: "Soft Rose", textColor: "#2e1a1a" },
  { color: "#fffbf0", name: "Warm Ivory", textColor: "#2d2416" },
  { color: "#f4f0ff", name: "Lavender", textColor: "#1a1a2e" },
  { color: "#f0fffe", name: "Aqua Tint", textColor: "#0a2e2e" },
  { color: "#f7f3ee", name: "Warm Sand", textColor: "#2d2416" },
];

const DARK_BACKGROUNDS: ColorPreset[] = [
  { color: "#1a1a2e", name: "Deep Navy", textColor: "#e8eaed" },
  { color: "#0f172a", name: "Slate", textColor: "#e2e8f0" },
  { color: "#1e1e1e", name: "Charcoal", textColor: "#e8eaed" },
  { color: "#0d1117", name: "Near Black", textColor: "#c9d1d9" },
  { color: "#1a0a2e", name: "Deep Purple", textColor: "#e8e0f0" },
  { color: "#0a1628", name: "Midnight", textColor: "#d4e0f0" },
  { color: "#1a2e1a", name: "Forest", textColor: "#d0e8d0" },
  { color: "#2e1a0a", name: "Walnut", textColor: "#e8d4c0" },
  { color: "#1a2e2e", name: "Dark Teal", textColor: "#c0e8e8" },
  { color: "#2a1a1a", name: "Burgundy", textColor: "#e8d0d0" },
];

const LIGHT_ACCENTS: ColorPreset[] = [
  { color: "#1e3a5f", name: "Navy" },
  { color: "#1a6b3c", name: "Forest Green" },
  { color: "#7c1a1a", name: "Crimson" },
  { color: "#5c1a7c", name: "Royal Purple" },
  { color: "#1a5c5c", name: "Dark Teal" },
  { color: "#c4760a", name: "Amber" },
  { color: "#1a4a6b", name: "Steel Blue" },
  { color: "#6b3a1a", name: "Rust" },
  { color: "#3d6b1a", name: "Olive" },
  { color: "#6b1a4a", name: "Wine" },
];

const DARK_ACCENTS: ColorPreset[] = [
  { color: "#60a5fa", name: "Bright Blue" },
  { color: "#34d399", name: "Emerald" },
  { color: "#f87171", name: "Coral" },
  { color: "#a78bfa", name: "Violet" },
  { color: "#fbbf24", name: "Amber" },
  { color: "#2dd4bf", name: "Teal" },
  { color: "#fb923c", name: "Orange" },
  { color: "#e879f9", name: "Pink" },
  { color: "#86efac", name: "Green" },
  { color: "#67e8f9", name: "Cyan" },
];

interface SwatchRowProps {
  presets: ColorPreset[];
  selected: string | undefined;
  onSelect: (preset: ColorPreset) => void;
}

function SwatchRow({ presets, selected, onSelect }: SwatchRowProps) {
  return (
    <Group gap={6} wrap="wrap">
      {presets.map((preset) => (
        <Tooltip
          key={preset.color}
          label={preset.name}
          withArrow
          openDelay={400}
        >
          <Box
            style={{ position: "relative", cursor: "pointer" }}
            onClick={() => onSelect(preset)}
          >
            <ColorSwatch
              color={preset.color}
              size={22}
              style={{
                outline:
                  selected === preset.color
                    ? "2px solid var(--mantine-color-blue-6)"
                    : "1px solid rgba(0,0,0,0.12)",
                outlineOffset: selected === preset.color ? 2 : 0,
              }}
            />
            {selected === preset.color && (
              <Box
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <CheckIcon
                  sx={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}
                />
              </Box>
            )}
          </Box>
        </Tooltip>
      ))}
    </Group>
  );
}

interface DocumentStylePickerProps {
  value: DocumentStyleSelection;
  onChange: (style: DocumentStyleSelection) => void;
}

export function DocumentStylePicker({
  value,
  onChange,
}: DocumentStylePickerProps) {
  const [opened, setOpened] = useState(false);
  const [customBg, setCustomBg] = useState("");
  const [customAccent, setCustomAccent] = useState("");

  const isDark = DARK_BACKGROUNDS.some(
    (p) => p.color === value.backgroundColor,
  );
  const accentPresets = isDark ? DARK_ACCENTS : LIGHT_ACCENTS;
  const hasSelection = !!(value.primaryColor || value.backgroundColor);

  function selectBackground(preset: ColorPreset) {
    onChange({
      ...value,
      backgroundColor: preset.color,
      bodyTextColor: preset.textColor,
      // Clear accent if the dark/light mode changes so we don't end up with
      // a dark accent on a dark background or vice versa.
      primaryColor: undefined,
    });
    setCustomBg("");
  }

  function selectAccent(preset: ColorPreset) {
    onChange({ ...value, primaryColor: preset.color });
    setCustomAccent("");
  }

  function isValidCssColor(v: string) {
    return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$/.test(v);
  }

  function applyCustomBg() {
    const v = customBg.trim();
    if (!v || !isValidCssColor(v)) return;
    onChange({ ...value, backgroundColor: v, bodyTextColor: undefined });
  }

  function applyCustomAccent() {
    const v = customAccent.trim();
    if (!v || !isValidCssColor(v)) return;
    onChange({ ...value, primaryColor: v });
  }

  function clearStyle() {
    onChange({});
    setCustomBg("");
    setCustomAccent("");
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-end"
      withArrow
      shadow="md"
      width={260}
    >
      <Popover.Target>
        <Tooltip
          label={hasSelection ? "Document style (active)" : "Document style"}
          withArrow
          openDelay={400}
        >
          <ActionIcon
            variant={hasSelection ? "light" : "subtle"}
            color={hasSelection ? "blue" : "gray"}
            size="sm"
            onClick={() => setOpened((v) => !v)}
            aria-label="Document style"
          >
            <PaletteIcon sx={{ fontSize: 16 }} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown p="sm">
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" fw={600}>
              Document Style
            </Text>
            {hasSelection && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="xs"
                onClick={clearStyle}
                aria-label="Clear style"
              >
                <CloseIcon sx={{ fontSize: 12 }} />
              </ActionIcon>
            )}
          </Group>

          {/* Background */}
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Background — Light
            </Text>
            <SwatchRow
              presets={LIGHT_BACKGROUNDS}
              selected={value.backgroundColor}
              onSelect={selectBackground}
            />
            <Text size="xs" c="dimmed" mt={2}>
              Background — Dark
            </Text>
            <SwatchRow
              presets={DARK_BACKGROUNDS}
              selected={value.backgroundColor}
              onSelect={selectBackground}
            />
            <TextInput
              placeholder="Custom e.g. #f0e6d3"
              size="xs"
              value={customBg}
              onChange={(e) => setCustomBg(e.currentTarget.value)}
              onBlur={applyCustomBg}
              onKeyDown={(e) => e.key === "Enter" && applyCustomBg()}
              mt={2}
              styles={{ input: { fontSize: 11 } }}
            />
          </Stack>

          {/* Accent */}
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              Accent {isDark ? "(dark mode)" : ""}
            </Text>
            <SwatchRow
              presets={accentPresets}
              selected={value.primaryColor}
              onSelect={selectAccent}
            />
            <TextInput
              placeholder="Custom e.g. #2563eb"
              size="xs"
              value={customAccent}
              onChange={(e) => setCustomAccent(e.currentTarget.value)}
              onBlur={applyCustomAccent}
              onKeyDown={(e) => e.key === "Enter" && applyCustomAccent()}
              mt={2}
              styles={{ input: { fontSize: 11 } }}
            />
          </Stack>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
