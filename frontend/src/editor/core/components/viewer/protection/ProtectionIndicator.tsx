import { useState } from "react";
import { Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@editor/styles/zIndex";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { ActionIcon } from "@editor/ui/ActionIcon";

export interface ProtectionRight {
  name: string;
  allowed: boolean;
  value?: string;
  override?: { label: string; tooltip: string };
}

export interface ProtectionFact {
  label: string;
  value: string;
}

export interface ProtectionAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ProtectionSummary {
  fileName?: string;
  icon: IconName;
  iconColor: string;
  title: string;
  color?: string | null;
  summary: string;
  owner?: string | null;
  source: string;
  facts: ProtectionFact[];
  rights: ProtectionRight[];
  actions: ProtectionAction[];
}

function ColorDot({ color }: { color?: string | null }) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function FactRow({
  label,
  value,
  restricted,
  override,
}: ProtectionFact & {
  restricted?: boolean;
  override?: ProtectionRight["override"];
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Text size="sm">{label}</Text>
      <Group gap={6} wrap="nowrap">
        {override && (
          <Tooltip
            content={override.tooltip}
            position="top"
            maxWidth={240}
            arrow
            containerStyle={{ zIndex: Z_INDEX_OVER_FULLSCREEN_SURFACE + 1 }}
          >
            <ActionIcon
              size="sm"
              variant="quiet"
              accent="neutral"
              aria-label={override.label}
            >
              <Icon name="lock-open" size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        {restricted && (
          <Icon
            name="lock"
            size={12}
            aria-hidden
            style={{ color: "var(--c-text-muted)", flexShrink: 0 }}
          />
        )}
        <Text
          size="sm"
          ta="right"
          c={restricted ? "var(--c-text-muted)" : undefined}
          style={{ overflowWrap: "anywhere" }}
        >
          {value}
        </Text>
      </Group>
    </Group>
  );
}

export function ProtectionIndicator({
  protection,
}: {
  protection: ProtectionSummary;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProtectionAction | null>(
    null,
  );
  return (
    <>
      <Group
        data-testid="protection-bar"
        gap="xs"
        wrap="nowrap"
        px="sm"
        style={{
          minHeight: 32,
          borderBottom: "1px solid var(--c-border-subtle)",
          background: "var(--c-bg-raised)",
        }}
      >
        <Icon
          name={protection.icon}
          size={16}
          style={{ color: protection.iconColor, flexShrink: 0 }}
        />
        <ColorDot color={protection.color} />
        <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
          {protection.title}
        </Text>
        <Text size="sm" c="dimmed" aria-hidden>
          ·
        </Text>
        <Text size="sm" c="dimmed" truncate style={{ minWidth: 0, flex: 1 }}>
          {protection.summary}
        </Text>
        <Button
          variant="quiet"
          accent="neutral"
          size="sm"
          onClick={() => setOpened(true)}
        >
          {t("encryptedPdfUnlock.manageProtection", "Manage protection")}
        </Button>
      </Group>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        onExitTransitionEnd={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.onClick();
        }}
        title={t("encryptedPdfUnlock.manageProtection", "Manage protection")}
        centered
        size="sm"
        padding="md"
        radius="md"
        zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
        closeButtonProps={{ "aria-label": t("close", "Close") }}
      >
        <Stack gap="md" data-testid="protection-modal">
          <Group
            gap="sm"
            wrap="nowrap"
            p="sm"
            style={{
              background: "var(--c-surface-raised)",
              borderRadius: "var(--mantine-radius-md)",
            }}
          >
            <Icon
              name={protection.icon}
              size={20}
              style={{ color: protection.iconColor, flexShrink: 0 }}
            />
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
                {protection.fileName}
              </Text>
              <Group gap={6} wrap="nowrap">
                <ColorDot color={protection.color} />
                <Text size="xs" c="dimmed">
                  {protection.title} · {protection.summary}
                </Text>
              </Group>
              {protection.owner && (
                <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                  {t("protection.owner", "Owner: {{owner}}", {
                    owner: protection.owner,
                  })}
                </Text>
              )}
            </Stack>
          </Group>
          <FactRow
            label={t("protection.protectedWith", "Protected with")}
            value={protection.source}
          />
          {protection.facts.map((fact) => (
            <FactRow key={fact.label} {...fact} />
          ))}
          {protection.rights.map((right) => (
            <FactRow
              key={right.name}
              label={right.name}
              restricted={!right.allowed && !right.override}
              override={right.override}
              value={
                right.value ??
                (right.allowed
                  ? t("encryptedPdfUnlock.allowed", "Allowed")
                  : t("encryptedPdfUnlock.restricted", "Restricted"))
              }
            />
          ))}
          {protection.actions.map((action, index) => (
            <Button
              key={action.label}
              variant={index === 0 ? "primary" : "secondary"}
              disabled={action.disabled}
              onClick={() => {
                setPendingAction(action);
                setOpened(false);
              }}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      </Modal>
    </>
  );
}
