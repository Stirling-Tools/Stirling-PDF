import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import {
  connectAccount,
  disconnectAccount,
  fetchConnectedAccounts,
  type CloudProvider,
  type ConnectedAccount,
  type ConnectedAccountsState,
  type ConnectOutcome,
} from "@app/services/connectedAccountsService";

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

/** Re-reads the account list; every mounted hook sees the result. */
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

/** The latest list, for code that just awaited a connect and cannot wait for a re-render. */
export function connectedAccountFor(
  provider: CloudProvider,
): ConnectedAccount | undefined {
  return snapshot.accounts.find(
    (account) =>
      account.provider === provider && account.status === "CONNECTED",
  );
}

/** Every account in the latest list, for code that just awaited a connect. */
export function latestConnectedAccounts(): ConnectedAccount[] {
  return snapshot.accounts;
}

/**
 * The provider's connected account, connecting one first when there is none.
 * Call it straight from a click handler: the sign-in pop-up opens before any
 * await, so it stays inside the click's user activation. `account` is
 * undefined when the user closed or failed the sign-in; `outcome` says which.
 */
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

/** For tests: forget the shared list. */
export function resetConnectedAccountsForTests() {
  snapshot = EMPTY;
  loaded = false;
  inflight = null;
}

export interface UseConnectedAccounts {
  /** Whether the server lets users connect an account for this provider. */
  available: (provider: CloudProvider) => boolean;
  accounts: ConnectedAccount[];
  /** The first healthy account for a provider, if any. */
  accountFor: (provider: CloudProvider) => ConnectedAccount | undefined;
  loaded: boolean;
  connect: (provider: CloudProvider) => Promise<ConnectOutcome>;
  disconnect: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * The signed-in user's connected accounts, shared across the editor, settings
 * and portal. Fetches only when the server offers connections at all, so a
 * server without them never calls the endpoint.
 */
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
