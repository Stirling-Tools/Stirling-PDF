import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Modal, Paper, Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@editor/styles/zIndex";
import {
  useMcpGrants,
  type McpGrant,
} from "@editor/components/shared/config/configSections/mcp/useMcpGrants";

function GrantRow({
  grant,
  revoking,
  failed,
  onRevoke,
}: {
  grant: McpGrant;
  revoking: boolean;
  failed: boolean;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  const lastUsed = grant.lastUsedAt
    ? t("config.mcp.grants.lastUsed", "Last used {{when}}", {
        when: new Date(grant.lastUsedAt).toLocaleString(),
      })
    : t("config.mcp.grants.neverUsed", "Not used yet");
  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text size="sm">{grant.clientName}</Text>
        <Text size="xs" c="dimmed">
          {lastUsed}
        </Text>
        {failed && (
          <Text size="xs" c="var(--c-danger)" role="alert">
            {t(
              "config.mcp.grants.revokeFailed",
              "Could not revoke this app. Try again.",
            )}
          </Text>
        )}
      </Stack>
      <Button
        size="sm"
        variant="secondary"
        accent="danger"
        disabled={revoking}
        onClick={onRevoke}
        style={{ flexShrink: 0 }}
      >
        {revoking
          ? t("config.mcp.grants.revoking", "Revoking...")
          : t("config.mcp.grants.revoke", "Revoke")}
      </Button>
    </Group>
  );
}

function RevokeGrantModal({
  opened,
  grant,
  onClose,
  onConfirm,
}: {
  opened: boolean;
  grant: McpGrant | null;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("config.mcp.grants.revokeTitle", "Revoke this app?")}
      centered
      withinPortal
      zIndex={Z_INDEX_OVER_CONFIG_MODAL}
    >
      <Stack gap="md">
        <Text size="sm">
          {t("config.mcp.grants.revokeConfirm", {
            app: grant?.clientName ?? "",
            defaultValue:
              "{{app}} loses access to your Stirling PDF account and has to ask for your approval again to reconnect.",
          })}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel", "Cancel")}
          </Button>
          <Button
            accent="danger"
            onClick={() => {
              if (grant) onConfirm(grant.id);
              onClose();
            }}
          >
            {t("config.mcp.grants.revoke", "Revoke")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function GrantList({
  grants,
  loadFailed,
  revoking,
  revokeFailed,
  onRevoke,
}: {
  grants: McpGrant[] | null;
  loadFailed: boolean;
  revoking: number | null;
  revokeFailed: number | null;
  onRevoke: (grant: McpGrant) => void;
}) {
  const { t } = useTranslation();
  if (loadFailed) {
    return (
      <Text size="xs" c="var(--c-danger)" role="alert">
        {t("config.mcp.grants.loadFailed", "Could not load connected apps.")}
      </Text>
    );
  }
  if (grants === null) {
    return (
      <Text size="xs" c="dimmed">
        {t("config.mcp.grants.loading", "Loading connected apps...")}
      </Text>
    );
  }
  if (grants.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        {t(
          "config.mcp.grants.empty",
          "No apps connected yet. Once you approve one, it appears here and you can revoke it at any time.",
        )}
      </Text>
    );
  }
  return (
    <>
      {grants.map((grant) => (
        <GrantRow
          key={grant.id}
          grant={grant}
          revoking={revoking === grant.id}
          failed={revokeFailed === grant.id}
          onRevoke={() => onRevoke(grant)}
        />
      ))}
    </>
  );
}

/** Apps the user approved on the consent screen, each revocable. */
export function McpConnectedApps() {
  const { t } = useTranslation();
  const { grants, loadFailed, revoking, revokeFailed, revoke } = useMcpGrants();
  const [confirming, setConfirming] = useState<McpGrant | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={500} size="sm">
          {t("config.mcp.grants.title", "Connected apps")}
        </Text>
        <GrantList
          grants={grants}
          loadFailed={loadFailed}
          revoking={revoking}
          revokeFailed={revokeFailed}
          onRevoke={(grant) => {
            setConfirming(grant);
            setConfirmOpen(true);
          }}
        />
      </Stack>
      <RevokeGrantModal
        opened={confirmOpen}
        grant={confirming}
        onClose={() => setConfirmOpen(false)}
        onConfirm={(id) => void revoke(id)}
      />
    </Paper>
  );
}
