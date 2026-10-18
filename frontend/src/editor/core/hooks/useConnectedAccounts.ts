import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import {
  connectAccount,
  disconnectAccount,
  fetchConnectedAccounts,
  type CloudProvider,
  type ConnectedAccount,
  type ConnectedAccountsState,
  type ConnectOutcome,
} from "@editor/services/connectedAccountsService";

const EMPTY: ConnectedAccountsState = {
  providers: { microsoft: false, google: false },
  accounts: [],
};

let snapshot: ConnectedAccountsState = EMPTY;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: ConnectedAccountsState) {
  snapshot = next;
  loaded = true;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function refreshConnectedAccounts(): Promise<void> {
  if (!inflight) {
    inflight = fetchConnectedAccounts()
      .then(publish)
      .catch(() => publish(EMPTY))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function connectedAccountFor(
  provider: CloudProvider,
): ConnectedAccount | undefined {
  return snapshot.accounts.find(
    (account) =>
      account.provider === provider && account.status === "CONNECTED",
  );
}

export function latestConnectedAccounts(): ConnectedAccount[] {
  return snapshot.accounts;
}

export async function ensureConnectedAccount(
  provider: CloudProvider,
  connect: (provider: CloudProvider) => Promise<ConnectOutcome>,
): Promise<{ account?: ConnectedAccount; outcome?: ConnectOutcome }> {
  const existing = connectedAccountFor(provider);
  if (existing) {
    return { account: existing };
  }
  const outcome = await connect(provider);
  return { account: connectedAccountFor(provider), outcome };
}

export function resetConnectedAccountsForTests() {
  snapshot = EMPTY;
  loaded = false;
  inflight = null;
}

export interface UseConnectedAccounts {
  available: (provider: CloudProvider) => boolean;
  accounts: ConnectedAccount[];
  accountFor: (provider: CloudProvider) => ConnectedAccount | undefined;
  loaded: boolean;
  connect: (provider: CloudProvider) => Promise<ConnectOutcome>;
  disconnect: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConnectedAccounts(): UseConnectedAccounts {
  const { config } = useAppConfig();
  const offered = Boolean(
    config?.microsoftAccountConnections ||
    config?.googleDriveAccountConnections,
  );
  const state = useSyncExternalStore(subscribe, () => snapshot);

  useEffect(() => {
    if (offered && !loaded) {
      void refreshConnectedAccounts();
    }
  }, [offered]);

  const available = useCallback(
    (provider: CloudProvider) =>
      offered &&
      (provider === "microsoft"
        ? Boolean(config?.microsoftAccountConnections)
        : Boolean(config?.googleDriveAccountConnections)),
    [
      offered,
      config?.microsoftAccountConnections,
      config?.googleDriveAccountConnections,
    ],
  );

  const accountFor = useCallback(
    (provider: CloudProvider) =>
      state.accounts.find(
        (account) =>
          account.provider === provider && account.status === "CONNECTED",
      ),
    [state.accounts],
  );

  const connect = useCallback(async (provider: CloudProvider) => {
    const outcome = await connectAccount(provider);
    await refreshConnectedAccounts();
    return outcome;
  }, []);

  const disconnect = useCallback(async (id: number) => {
    await disconnectAccount(id);
    await refreshConnectedAccounts();
  }, []);

  return {
    available,
    accounts: state.accounts,
    accountFor,
    loaded: loaded || !offered,
    connect,
    disconnect,
    refresh: refreshConnectedAccounts,
  };
}
