import { useTranslation } from "react-i18next";
import { Group, Paper, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import {
  useMcpGrants,
  type McpGrant,
} from "@app/components/shared/config/configSections/mcp/useMcpGrants";

function GrantRow({
  grant,
  revoking,
  onRevoke,
}: {
  grant: McpGrant;
  revoking: boolean;
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

function GrantList({
  grants,
  revoking,
  onRevoke,
}: {
  grants: McpGrant[] | null;
  revoking: number | null;
  onRevoke: (id: number) => void;
}) {
  const { t } = useTranslation();
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
          onRevoke={() => onRevoke(grant.id)}
        />
      ))}
    </>
  );
}

/** Apps the user approved on the consent screen, each revocable. */
export function McpConnectedApps() {
  const { t } = useTranslation();
  const { grants, revoking, revoke } = useMcpGrants();
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={500} size="sm">
          {t("config.mcp.grants.title", "Connected apps")}
        </Text>
        <GrantList
          grants={grants}
          revoking={revoking}
          onRevoke={(id) => void revoke(id)}
        />
      </Stack>
    </Paper>
  );
}
