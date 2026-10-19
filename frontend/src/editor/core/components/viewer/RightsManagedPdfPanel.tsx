import { useEffect, useRef, useState } from "react";
import {
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { openExternal } from "@editor/platform/openExternal";
import { useConnectedServer } from "@editor/hooks/useConnectedServer";
import {
  ensureConnectedAccount,
  refreshConnectedAccounts,
  useConnectedAccounts,
} from "@editor/hooks/useConnectedAccounts";
import {
  fetchRightsManagementStatus,
  openRightsManagedPdf,
  RightsManagementError,
  type RightsManagementStatus,
} from "@editor/services/rightsManagedPdf";

type PanelError = { message: string; owner: string | null; reconnect: boolean };

export function RightsManagedPdfPanel({
  file,
  onClose,
}: {
  file: File;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const connectedServer = useConnectedServer();
  const { connect } = useConnectedAccounts();
  const [status, setStatus] = useState<RightsManagementStatus | null>(null);
  const [accountId, setAccountId] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setError(null);
    setBusy(false);
    if (!connectedServer) {
      setStatus({ enabled: false, available: false, accounts: [] });
      return () => controller.abort();
    }
    void fetchRightsManagementStatus().then((next) => {
      if (controller.signal.aborted) return;
      setStatus(next);
      const connected = next.accounts.filter(
        (account) => account.status === "CONNECTED",
      );
      if (connected.length > 0) setAccountId(connected[0].id);
      if (connected.length === 1 && next.available) void open(connected[0].id);
    });
    return () => controller.abort();
  }, [connectedServer, file]);

  const connectedAccounts =
    status?.accounts.filter((account) => account.status === "CONNECTED") ?? [];

  const describe = (cause: unknown): PanelError => {
    if (cause instanceof RightsManagementError) {
      if (cause.code === "access_denied")
        return {
          message: t(
            "rightsManagedPdf.accessDenied",
            "Microsoft refused access. Sign in again, or ask your administrator to check Stirling's Microsoft Purview permissions.",
          ),
          owner: null,
          reconnect: true,
        };
      if (cause.code === "no_permissions")
        return {
          message: t(
            "rightsManagedPdf.noPermissions",
            "Your Microsoft account does not have permission to open this PDF.",
          ),
          owner: cause.owner,
          reconnect: false,
        };
      if (cause.code === "sign_in_required")
        return {
          message: t(
            "rightsManagedPdf.signInRequired",
            "Sign in to your Microsoft account again to open this PDF.",
          ),
          owner: null,
          reconnect: true,
        };
      return { message: cause.message, owner: null, reconnect: false };
    }
    return {
      message: t(
        "rightsManagedPdf.openFailed",
        "Unable to open this protected PDF. Please try again.",
      ),
      owner: null,
      reconnect: false,
    };
  };

  async function open(id: number | undefined) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    setBusy(true);
    setError(null);
    try {
      await openRightsManagedPdf(file, id, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(describe(cause));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const connectThenOpen = async () => {
    setError(null);
    const { account, outcome } = await ensureConnectedAccount(
      "microsoft",
      connect,
    );
    if (!account) {
      if (outcome !== "connected")
        setError({
          message: t(
            "rightsManagedPdf.connectCancelled",
            "Microsoft sign-in did not complete.",
          ),
          owner: null,
          reconnect: false,
        });
      return;
    }
    await refreshConnectedAccounts();
    const next = await fetchRightsManagementStatus();
    setStatus(next);
    setAccountId(account.id);
    await open(account.id);
  };

  const unavailable = status !== null && !status.available;
  const needsAccount = status?.available && connectedAccounts.length === 0;

  return (
    <Center style={{ flex: 1, padding: "var(--space-6, 1.5rem)" }}>
      <Stack
        align="center"
        gap="md"
        maw={440}
        data-testid="rights-managed-pdf-panel"
      >
        <Icon name="shield-check" size={40} />
        <Title order={4} ta="center">
          {t("rightsManagedPdf.title", "Protected by Microsoft Purview")}
        </Title>
        <Text ta="center" c="dimmed">
          {unavailable
            ? connectedServer
              ? t(
                  "rightsManagedPdf.unavailable",
                  "This server cannot open Microsoft Purview protected PDFs. Ask your administrator to turn it on, or open the file in a Microsoft 365 app.",
                )
              : t(
                  "rightsManagedPdf.needsServer",
                  "Sign in to your organisation's Stirling server to open Microsoft Purview protected PDFs.",
                )
            : t(
                "rightsManagedPdf.description",
                "This PDF is encrypted by a sensitivity label. Open it with the Microsoft account it was shared with.",
              )}
        </Text>
        {busy && !error && (
          <Group gap="xs" data-testid="rights-managed-pdf-opening">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {t(
                "rightsManagedPdf.opening",
                "Opening with your Microsoft account…",
              )}
            </Text>
          </Group>
        )}
        {error && (
          <Stack gap={4} align="center" data-testid="rights-managed-pdf-error">
            <Text c="var(--c-danger)" ta="center">
              {error.message}
            </Text>
            {error.owner && (
              <Text size="sm" c="dimmed" ta="center">
                {t("rightsManagedPdf.askOwner", "Ask {{owner}} for access.", {
                  owner: error.owner,
                })}
              </Text>
            )}
          </Stack>
        )}
        {connectedAccounts.length > 1 && (
          <Select
            label={t("rightsManagedPdf.account", "Microsoft account")}
            data={connectedAccounts.map((account) => ({
              value: String(account.id),
              label: account.email ?? String(account.id),
            }))}
            value={accountId === undefined ? null : String(accountId)}
            onChange={(value) =>
              setAccountId(value === null ? undefined : Number(value))
            }
            allowDeselect={false}
            w="100%"
          />
        )}
        {status === null || (busy && !error) ? null : error?.owner ? (
          <Group gap="sm" justify="center">
            <Button onClick={() => void openExternal(`mailto:${error.owner}`)}>
              {t("protection.emailOwner", "Email the owner")}
            </Button>
            <Button variant="secondary" onClick={() => void open(accountId)}>
              {t("rightsManagedPdf.tryAgain", "Try again")}
            </Button>
          </Group>
        ) : needsAccount || error?.reconnect ? (
          <Button onClick={() => void connectThenOpen()} loading={busy}>
            {t("rightsManagedPdf.connect", "Sign in with Microsoft")}
          </Button>
        ) : (
          !unavailable && (
            <Button
              onClick={() => void open(accountId)}
              loading={busy}
              disabled={connectedAccounts.length > 1 && accountId === undefined}
            >
              {t("rightsManagedPdf.open", "Open with Microsoft")}
            </Button>
          )
        )}
        {onClose && (
          <Button variant="secondary" onClick={onClose}>
            {t("close", "Close")}
          </Button>
        )}
      </Stack>
    </Center>
  );
}
