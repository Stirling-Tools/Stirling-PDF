import { Fragment, useState } from "react";
import { Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal, SectionDivider, StatusBadge } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@editor/styles/zIndex";
import { useConnectedAccounts } from "@editor/hooks/useConnectedAccounts";
import {
  isPopupBlocked,
  type CloudProvider,
  type ConnectedAccount,
} from "@editor/services/connectedAccountsService";

const PROVIDERS: { id: CloudProvider; icon: "onedrive" | "googledrive" }[] = [
  { id: "microsoft", icon: "onedrive" },
  { id: "google", icon: "googledrive" },
];

export default function ConnectedAccountsSection() {
  const { t } = useTranslation();
  const { available, accounts, connect, disconnect } = useConnectedAccounts();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] =
    useState<ConnectedAccount | null>(null);

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
            <Group justify="space-between" gap="sm" mb={mine.length ? "sm" : 0}>
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
            <Stack gap={0}>
              {mine.map((account, index) => (
                <Fragment key={account.id}>
                  {index > 0 && <SectionDivider spacing={10} />}
                  <AccountRow
                    account={account}
                    busy={busy}
                    onReconnect={() =>
                      void run(`connect-${provider.id}`, () =>
                        connect(provider.id),
                      )
                    }
                    onDisconnect={() => setPendingDisconnect(account)}
                  />
                </Fragment>
              ))}
            </Stack>
          </Paper>
        );
      })}
      <Modal
        open={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
        width="sm"
        zIndex={Z_INDEX_OVER_CONFIG_MODAL}
        title={t("connectedAccounts.disconnectConfirm.title", {
          defaultValue: "Disconnect {{account}}?",
          account: pendingDisconnect ? accountName(pendingDisconnect) : "",
        })}
        footer={
          <Group justify="flex-end" gap="sm">
            <Button
              variant="secondary"
              onClick={() => setPendingDisconnect(null)}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              data-testid="confirm-disconnect"
              onClick={() => {
                const account = pendingDisconnect;
                setPendingDisconnect(null);
                if (account) {
                  void run(`remove-${account.id}`, () =>
                    disconnect(account.id),
                  );
                }
              }}
            >
              {t("connectedAccounts.disconnectConfirm.confirm", "Disconnect")}
            </Button>
          </Group>
        }
      >
        <Text size="sm">
          {t(
            "connectedAccounts.disconnectConfirm.body",
            "Sources and pipelines that use this account will stop until you connect it again.",
          )}
        </Text>
      </Modal>
    </Stack>
  );
}

function accountName(account: ConnectedAccount): string {
  return account.email ?? account.displayName ?? String(account.id);
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
      gap="xs"
      data-testid={`connected-account-${account.id}`}
    >
      <Stack gap={4} style={{ flex: "1 1 16rem", minWidth: 0 }}>
        <Group gap="xs">
          <Text size="sm" style={{ overflowWrap: "anywhere" }}>
            {accountName(account)}
          </Text>
          <StatusBadge tone={needsReconnect ? "danger" : "success"} size="sm">
            {needsReconnect
              ? t("connectedAccounts.status.needsSignIn", "Needs sign-in")
              : t("connectedAccounts.status.connected", "Connected")}
          </StatusBadge>
        </Group>
        <Text size="xs" style={{ color: "var(--c-text-muted)" }}>
          {account.personal
            ? t("connectedAccounts.personal", "Personal account")
            : t("connectedAccounts.work", "Work account")}
        </Text>
        {needsReconnect && (
          <Text size="xs" style={{ color: "var(--c-danger)" }}>
            {t(
              "connectedAccounts.needsReconnect",
              "Stirling can no longer reach this account, so pipelines using it are paused.",
            )}
          </Text>
        )}
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
