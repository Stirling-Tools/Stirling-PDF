import type { ReactNode } from "react";
import { Box, Group, NumberInput, Stack, Text, Tooltip } from "@mantine/core";
import HelpIcon from "@mui/icons-material/HelpOutlineOutlined";

/** Shared layout atoms for the editor's properties inspector. */

/** Uppercase section heading, optionally with a trailing control. */
export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap={4} mb={8}>
      <Text
        size="xs"
        fw={600}
        c="dimmed"
        tt="uppercase"
        style={{ letterSpacing: "0.5px" }}
      >
        {children}
      </Text>
      {right}
    </Group>
  );
}

/** One bordered band. Sections stack with a hairline between them. */
export function Section({
  children,
  testId,
  tinted,
  first,
}: {
  children: ReactNode;
  testId?: string;
  tinted?: boolean;
  /** Topmost band in its panel: no rule above it. */
  first?: boolean;
}) {
  return (
    <Box
      px="md"
      py="sm"
      data-testid={testId}
      style={{
        borderTop: first
          ? undefined
          : "1px solid var(--mantine-color-default-border)",
        background: tinted ? "var(--mantine-color-default-hover)" : undefined,
      }}
    >
      {children}
    </Box>
  );
}

/** Label above a control, the panel's only field layout. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed" fw={500}>
          {label}
        </Text>
        {hint && <HintIcon label={hint} />}
      </Group>
      {children}
    </Stack>
  );
}

/** The `?` that replaced the panel's permanent explanatory paragraphs. */
export function HintIcon({ label }: { label: string }) {
  return (
    <Tooltip label={label} multiline w={220} withArrow position="left">
      <HelpIcon
        fontSize="inherit"
        style={{
          fontSize: 13,
          cursor: "help",
          color: "var(--mantine-color-dimmed)",
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}

/** Read-only key/value line used by the Document tab. */
export function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xs" fw={500}>
        {value}
      </Text>
    </Group>
  );
}

/**
 * A points field that only commits a real change.
 *
 * Geometry edits dispatch undoable commands, so re-emitting the value the
 * field already shows would cost a spurious undo step on every blur.
 */
export function PointsInput({
  value,
  onCommit,
  label,
  testId,
  min,
  disabled,
}: {
  value: number;
  onCommit: (next: number) => void;
  label: string;
  testId?: string;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <NumberInput
      size="xs"
      min={min}
      decimalScale={1}
      fixedDecimalScale
      step={1}
      value={Number(value.toFixed(1))}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onChange={(next) => {
        const n = typeof next === "number" ? next : Number(next);
        if (!Number.isFinite(n)) return;
        if (Math.abs(n - value) < 0.05) return;
        onCommit(n);
      }}
    />
  );
}
