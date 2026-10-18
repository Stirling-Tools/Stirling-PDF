import { useState } from "react";
import { Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { useConnectedAccounts } from "@app/hooks/useConnectedAccounts";
import {
  isPopupBlocked,
  type CloudProvider,
  type ConnectedAccount,
} from "@app/services/connectedAccountsService";

const PROVIDERS: { id: CloudProvider; icon: "onedrive" | "googledrive" }[] = [
  { id: "microsoft", icon: "onedrive" },
  { id: "google", icon: "googledrive" },
];

/**
 * The user's own Microsoft and Google accounts. Connecting once lets the
 * editor open files from OneDrive, SharePoint and Google Drive without signing
 * in again, and lets the user's pipelines read and save there as them.
 */
export default function ConnectedAccountsSection() {
  const { t } = useTranslation();
  const { available, accounts, connect, disconnect } = useConnectedAccounts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerName = (provider: CloudProvider) =>
    provider === "microsoft"
      ? t("connectedAccounts.microsoft", "Microsoft (OneDrive & SharePoint)")
      : t("connectedAccounts.google", "Google Drive");

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      const outcome = await action();
      if (outcome === "error") {
        setError(
          t(
            "connectedAccounts.connectFailed",
            "The account couldn't be connected. Check that the server's app registration is set up, then try again.",
          ),
        );
      }
    } catch (e) {
      setError(
        isPopupBlocked(e)
          ? t(
              "connectedAccounts.popupBlocked",
              "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
            )
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(null);
    }
  }

  const offered = PROVIDERS.filter((provider) => available(provider.id));

  return (
    <Stack gap="md" data-testid="connected-accounts">
      <Text size="sm" c="dimmed">
        {t(
          "connectedAccounts.intro",
          "Connect your own accounts once. The editor can then open files from them without signing in again, and your pipelines can read from and save to them as you.",
        )}
      </Text>
      {error && (
        <Banner tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}
      {offered.length === 0 && (
        <Text size="sm">
          {t(
            "connectedAccounts.none",
            "Your administrator hasn't turned on connected accounts.",
          )}
        </Text>
      )}
      {offered.map((provider) => {
        const mine = accounts.filter((a) => a.provider === provider.id);
        return (
          <Paper
            key={provider.id}
            p="md"
            radius="md"
            withBorder
            style={{ background: "var(--c-surface)" }}
          >
            <Group
              justify="space-between"
              wrap="nowrap"
              mb={mine.length ? "sm" : 0}
            >
              <Group gap="sm" wrap="nowrap">
                <Icon name={provider.icon} size={20} />
                <Text fw={600}>{providerName(provider.id)}</Text>
              </Group>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === `connect-${provider.id}`}
                data-testid={`connect-${provider.id}`}
                onClick={() =>
                  void run(`connect-${provider.id}`, () => connect(provider.id))
                }
              >
                {mine.length
                  ? t("connectedAccounts.connectAnother", "Connect another")
                  : t("connectedAccounts.connect", "Connect")}
              </Button>
            </Group>
            <Stack gap="xs">
              {mine.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  busy={busy}
                  onReconnect={() =>
                    void run(`connect-${provider.id}`, () =>
                      connect(provider.id),
                    )
                  }
                  onDisconnect={() =>
                    void run(`remove-${account.id}`, () =>
                      disconnect(account.id),
                    )
                  }
                />
              ))}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

interface AccountRowProps {
  account: ConnectedAccount;
  busy: string | null;
  onReconnect: () => void;
  onDisconnect: () => void;
}

function AccountRow({
  account,
  busy,
  onReconnect,
  onDisconnect,
}: AccountRowProps) {
  const { t } = useTranslation();
  const needsReconnect = account.status === "NEEDS_RECONNECT";
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      data-testid={`connected-account-${account.id}`}
    >
      <Stack gap={0}>
        <Text size="sm">{account.email ?? account.displayName}</Text>
        <Text
          size="xs"
          style={{
            color: needsReconnect ? "var(--c-danger)" : "var(--c-text-muted)",
          }}
        >
          {needsReconnect
            ? t(
                "connectedAccounts.needsReconnect",
                "Sign in again: Stirling can no longer reach this account, so pipelines using it are paused.",
              )
            : account.personal
              ? t("connectedAccounts.personal", "Personal account")
              : t("connectedAccounts.connected", "Connected")}
        </Text>
      </Stack>
      <Group gap="xs" wrap="nowrap">
        {needsReconnect && (
          <Button variant="primary" size="sm" onClick={onReconnect}>
            {t("connectedAccounts.reconnect", "Sign in again")}
          </Button>
        )}
        <Button
          variant="tertiary"
          accent="danger"
          size="sm"
          loading={busy === `remove-${account.id}`}
          onClick={onDisconnect}
        >
          {t("connectedAccounts.disconnect", "Disconnect")}
        </Button>
      </Group>
    </Group>
  );
}
