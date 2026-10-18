import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Banner, Button, Select } from "@app/ui";
import {
  latestConnectedAccounts,
  useConnectedAccounts,
} from "@app/hooks/useConnectedAccounts";
import type { CloudAccountProvider } from "@portal/components/sources/sourceTypes";
import "@portal/components/sources/connections.css";

interface ConnectedAccountPickerProps {
  provider: CloudAccountProvider;
  value: string;
  onChange: (accountId: string) => void;
}

/**
 * Picks one of the signed-in user's own connected accounts for a cloud location, or connects one
 * there and then. Only the owner can choose an account, which the backend enforces as well, so a
 * teammate editing the location sees only their own accounts.
 */
export function ConnectedAccountPicker({
  provider,
  value,
  onChange,
}: ConnectedAccountPickerProps) {
  const { t } = useTranslation();
  const { available, accounts, connect } = useConnectedAccounts();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = accounts.filter((account) => account.provider === provider);

  // A single account is the obvious choice; pre-select it rather than make the user click.
  useEffect(() => {
    if (!value && mine.length === 1) {
      onChange(String(mine[0].id));
    }
  }, [value, mine, onChange]);

  if (!available(provider)) {
    return (
      <Banner
        tone="info"
        description={t(
          "portal.sources.cloudFields.account.unavailable",
          "Connecting your own account is turned off on this server. Choose an organisation connection instead.",
        )}
      />
    );
  }

  async function connectNew() {
    setConnecting(true);
    setError(null);
    try {
      const before = new Set(mine.map((account) => account.id));
      const outcome = await connect(provider);
      if (outcome === "error") {
        setError(
          t(
            "portal.sources.cloudFields.account.connectFailed",
            "The account couldn't be connected. Try again, or ask your administrator to check the app registration.",
          ),
        );
      }
      const added = latestConnectedAccounts().find(
        (account) => account.provider === provider && !before.has(account.id),
      );
      if (added) {
        onChange(String(added.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="portal-sources__connection-picker">
      {mine.length > 0 && (
        <Select
          value={value || null}
          placeholder={t(
            "portal.sources.cloudFields.account.placeholder",
            "Choose an account",
          )}
          options={mine.map((account) => ({
            value: String(account.id),
            label:
              account.status === "NEEDS_RECONNECT"
                ? `${account.email ?? account.displayName} (${t("portal.sources.cloudFields.account.reconnect", "sign in again")})`
                : (account.email ?? account.displayName ?? String(account.id)),
          }))}
          onChange={(selected) => onChange(selected ?? "")}
        />
      )}
      <Button
        variant="secondary"
        loading={connecting}
        leftSection={<Icon name="plus" size="1em" />}
        onClick={() => void connectNew()}
        data-testid={`connect-account-${provider}`}
      >
        {mine.length > 0
          ? t(
              "portal.sources.cloudFields.account.connectAnother",
              "Connect another account",
            )
          : t(
              "portal.sources.cloudFields.account.connect",
              "Connect your account",
            )}
      </Button>
      {error && <Banner tone="danger" description={error} />}
    </div>
  );
}
