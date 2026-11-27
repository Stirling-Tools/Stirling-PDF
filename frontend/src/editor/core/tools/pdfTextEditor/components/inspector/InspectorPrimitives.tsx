import type { ReactNode } from "react";
import { Box, Group, NumberInput, Stack, Text } from "@mantine/core";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import {
  POINT_TO_UNIT,
  type MeasurementUnit,
} from "@editor/utils/measurementUtils";
import { localPaperSize } from "@editor/utils/paperSize";
/** Shared layout atoms for the editor's properties inspector. */

/** Section heading, optionally with an info affordance beside it and a trailing control. */
export function SectionLabel({
  children,
  info,
  right,
}: {
  children: ReactNode;
  info?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap={4} mb={8}>
      <Group gap={6} wrap="nowrap">
        <Text size="sm" fw={500}>
          {children}
        </Text>
        {info}
      </Group>
      {right}
    </Group>
  );
}

/** One band of the panel. Sections stack with a hairline between them. */
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
      py="md"
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
  testId,
  children,
}: {
  label: string;
  /** Explanation shown behind an (i) beside the label. */
  hint?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={4} style={{ flex: 1, minWidth: 0 }} data-testid={testId}>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed" fw={500}>
          {label}
        </Text>
        {hint && <ToolInfoTooltip label={hint} />}
      </Group>
      {children}
    </Stack>
  );
}

/** Read-only key/value line. */
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

type LengthUnit = Extract<MeasurementUnit, "mm" | "in">;

export const LENGTH_DECIMALS: Record<LengthUnit, number> = { mm: 1, in: 2 };

export const LENGTH_STEP: Record<LengthUnit, number> = { mm: 1, in: 0.1 };

export function lengthUnitFor(locales?: readonly string[]): LengthUnit {
  return localPaperSize<LengthUnit>("mm", "in", locales);
}

/**
 * A points field that only commits a real change. Its short name (X, W) sits
 * inside the field, so a pair of them fits side by side without labels above.
 *
 * Geometry edits dispatch undoable commands, so re-emitting the value the
 * field already shows would cost a spurious undo step on every blur.
 */
export function PointsInput({
  value,
  onCommit,
  label,
  prefix,
  unit,
  testId,
  min,
  disabled,
}: {
  value: number;
  onCommit: (next: number) => void;
  /** Spoken name, e.g. "Width". */
  label: string;
  /** Shown inside the field, e.g. "W". */
  prefix: string;
  unit: LengthUnit;
  testId?: string;
  min?: number;
  disabled?: boolean;
}) {
  const perPoint = POINT_TO_UNIT[unit];
  const decimals = LENGTH_DECIMALS[unit];
  const shown = Number((value * perPoint).toFixed(decimals));
  return (
    <NumberInput
      size="xs"
      hideControls
      leftSection={
        <Text size="xs" c="dimmed" fw={500} aria-hidden>
          {prefix}
        </Text>
      }
      rightSection={
        <Text size="xs" c="dimmed" aria-hidden>
          {unit}
        </Text>
      }
      min={min === undefined ? undefined : min * perPoint}
      decimalScale={decimals}
      fixedDecimalScale
      step={LENGTH_STEP[unit]}
      value={shown}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onChange={(next) => {
        const n = typeof next === "number" ? next : Number(next);
        if (!Number.isFinite(n) || n === shown) return;
        onCommit(n / perPoint);
      }}
    />
  );
}
