import type { ReactNode } from "react";
import { Box, Group, NumberInput, Stack, Text } from "@mantine/core";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
/** Shared layout atoms for the editor's properties inspector. */

/** Uppercase section heading, optionally with an info affordance beside it and a trailing control. */
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
        <Text
          size="xs"
          fw={600}
          c="dimmed"
          tt="uppercase"
          style={{ letterSpacing: "0.5px" }}
        >
          {children}
        </Text>
        {info}
      </Group>
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
        {hint && <ToolInfoTooltip label={hint} position="left" />}
      </Group>
      {children}
    </Stack>
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
export type LengthUnit = "mm" | "in";

const POINTS_PER: Record<LengthUnit, number> = { mm: 72 / 25.4, in: 72 };
const DECIMALS: Record<LengthUnit, number> = { mm: 1, in: 2 };
const INCH_REGIONS = new Set(["US", "LR", "MM"]);

export function lengthUnitFor(locale: string): LengthUnit {
  const region = locale
    .split(/[-_]/)
    .slice(1)
    .find((part) => /^([a-z]{2}|\d{3})$/i.test(part))
    ?.toUpperCase();
  return region && INCH_REGIONS.has(region) ? "in" : "mm";
}

export function PointsInput({
  value,
  onCommit,
  label,
  unit,
  testId,
  min,
  disabled,
}: {
  value: number;
  onCommit: (next: number) => void;
  label: string;
  unit: LengthUnit;
  testId?: string;
  min?: number;
  disabled?: boolean;
}) {
  const perUnit = POINTS_PER[unit];
  const decimals = DECIMALS[unit];
  const shown = Number((value / perUnit).toFixed(decimals));
  return (
    <NumberInput
      size="xs"
      min={min === undefined ? undefined : min / perUnit}
      decimalScale={decimals}
      fixedDecimalScale
      step={unit === "in" ? 0.1 : 1}
      suffix={` ${unit}`}
      value={shown}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onChange={(next) => {
        const n = typeof next === "number" ? next : Number(next);
        if (!Number.isFinite(n) || n === shown) return;
        onCommit(n * perUnit);
      }}
    />
  );
}
