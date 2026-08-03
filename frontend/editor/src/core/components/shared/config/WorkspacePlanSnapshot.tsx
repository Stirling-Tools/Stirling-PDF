import React from "react";
import {
  Badge,
  Card,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { LocalIcon } from "@app/components/shared/LocalIcon";

/** One read-only figure in the snapshot grid. */
export interface WorkspacePlanSnapshotRow {
  label: string;
  value: string;
  sub?: string;
}

export interface WorkspacePlanSnapshotProps {
  /** Optional banner heading; the banner renders only when both title and message are set. */
  bannerTitle?: string;
  /** Optional banner body explaining where plan/usage is governed. */
  bannerMessage?: string;
  /** Small caps label above the tier name, e.g. "Current plan". */
  currentPlanLabel: string;
  /** Human tier name, e.g. "Editor" / "Processor" / "Enterprise". */
  tierLabel: string;
  /** Status pill text, e.g. "Active". */
  statusLabel: string;
  /** Read-only figures rendered in a two-column grid. */
  rows: WorkspacePlanSnapshotRow[];
  /** Primary CTA label, e.g. "Manage in Usage & Billing". */
  ctaLabel: string;
  /** When false the CTA is disabled and {@link cannotManageHint} is shown. */
  canManage: boolean;
  /** Invoked when the enabled CTA is clicked (close modal + deep-link). */
  onManage: () => void;
  /** Hint shown under a disabled CTA (no portal access). */
  cannotManageHint?: string;
  /** Renders skeletons in the figure grid while live figures load. */
  loading?: boolean;
}

/**
 * Read-only "workspace mirror" of the plan/usage state, shown in the editor
 * settings modal. Plan management and billing now live in the PDF Processor
 * (portal); this surface only reflects the current state and deep-links out to
 * it. Purely presentational — every string is supplied by the caller so it
 * stays i18n-agnostic and Storybook-friendly.
 */
const WorkspacePlanSnapshot: React.FC<WorkspacePlanSnapshotProps> = ({
  bannerTitle,
  bannerMessage,
  currentPlanLabel,
  tierLabel,
  statusLabel,
  rows,
  ctaLabel,
  canManage,
  onManage,
  cannotManageHint,
  loading = false,
}) => {
  return (
    <Stack gap="md">
      {/* Optional context banner (omitted on the plan/usage page). */}
      {bannerTitle && bannerMessage && (
        <Paper
          radius="md"
          p="sm"
          style={{
            background: "var(--mantine-color-default-hover)",
            border: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Group gap="sm" align="flex-start" wrap="nowrap">
            <LocalIcon
              icon="lock"
              width="1rem"
              height="1rem"
              style={{
                color: "var(--mantine-color-dimmed)",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <Stack gap={2}>
              <Text size="sm" fw={600}>
                {bannerTitle}
              </Text>
              <Text size="xs" c="dimmed">
                {bannerMessage}
              </Text>
            </Stack>
          </Group>
        </Paper>
      )}

      {/* Snapshot card */}
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="center" mb="md" wrap="nowrap">
          <Group gap="sm" align="center" wrap="nowrap">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--mantine-primary-color-light)",
                flexShrink: 0,
              }}
            >
              <LocalIcon
                icon="credit-card"
                width="1.1rem"
                height="1.1rem"
                style={{ color: "var(--mantine-primary-color-filled)" }}
              />
            </div>
            <Stack gap={0}>
              <Text
                size="xs"
                c="dimmed"
                tt="uppercase"
                style={{ letterSpacing: "0.05em" }}
              >
                {currentPlanLabel}
              </Text>
              <Text size="md" fw={600}>
                {tierLabel}
              </Text>
            </Stack>
          </Group>
          <Badge color="green" variant="light" radius="sm">
            {statusLabel}
          </Badge>
        </Group>

        {/* Two-column figure grid with hairline separators */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            background: "var(--mantine-color-default-border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                background: "var(--mantine-color-body)",
                padding: "0.75rem",
              }}
            >
              <Text size="xs" c="dimmed">
                {row.label}
              </Text>
              {loading ? (
                <Skeleton height={18} width="60%" mt={4} radius="sm" />
              ) : (
                <Text size="md" fw={600} mt={2}>
                  {row.value}
                </Text>
              )}
              {row.sub && !loading && (
                <Text size="xs" c="dimmed" mt={2}>
                  {row.sub}
                </Text>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Deep-link to the portal's Usage & Billing surface */}
      <Button
        variant="primary"
        fullWidth
        justify="between"
        disabled={!canManage}
        onClick={onManage}
        leftSection={
          <LocalIcon icon="credit-card" width="1rem" height="1rem" />
        }
        rightSection={
          <LocalIcon icon="open-in-new-rounded" width="1rem" height="1rem" />
        }
      >
        {ctaLabel}
      </Button>
      {!canManage && cannotManageHint && (
        <Text size="xs" c="dimmed" ta="center">
          {cannotManageHint}
        </Text>
      )}
    </Stack>
  );
};

export default WorkspacePlanSnapshot;
