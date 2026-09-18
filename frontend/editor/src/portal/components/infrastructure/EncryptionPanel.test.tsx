import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock("@portal/api/storageEncryption", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@portal/api/storageEncryption")>();
  return {
    ...actual,
    fetchEncryptionStatus: vi.fn(),
    fetchMigrationStatus: vi.fn(),
  };
});

import { baseQueryOptions } from "@app/query/queryClient";
import {
  fetchEncryptionStatus,
  fetchMigrationStatus,
  type MigrationState,
  type MigrationStatus,
  type StorageEncryptionStatus,
} from "@portal/api/storageEncryption";
import { EncryptionPanel } from "@portal/components/infrastructure/EncryptionPanel";
import {
  resetTabVisibility,
  setTabHidden,
} from "@app/tests/utils/tabVisibility";

const POLL_MS = 2000;
const status = vi.mocked(fetchEncryptionStatus);
const migration = vi.mocked(fetchMigrationStatus);

function encryptionStatus(): StorageEncryptionStatus {
  return {
    writeEnabled: true,
    active: true,
    masterKeyFingerprint: "abc123",
    masterKeyVersion: 1,
    masterKeySource: "config",
    provider: "local",
    encryptedFiles: 10,
    plaintextFiles: 5,
    pendingRotationRows: 0,
    keys: [],
  };
}

function migrationStatus(
  state: MigrationState,
  processed = 1,
): MigrationStatus {
  return {
    state,
    total: 10,
    processed,
    skipped: 0,
    failed: 0,
    startedAt: "2026-01-01T00:00:00Z",
    finishedAt: state === "RUNNING" ? null : "2026-01-01T00:01:00Z",
  };
}

/** The app's own defaults, so a test can't pass on a library default the app overrides. */
function mount(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: baseQueryOptions },
  });
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider>{ui}</MantineProvider>
    </QueryClientProvider>,
  );
}

/** One poll's worth of time, plus the microtasks its response resolves through. */
async function polls(count: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS * count);
  });
}

beforeEach(() => {
  status.mockReset().mockResolvedValue(encryptionStatus());
  migration.mockReset().mockResolvedValue(migrationStatus("IDLE"));
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  resetTabVisibility();
  vi.useRealTimers();
});

/** Past the loading skeleton, so the panel's own state is on screen. */
async function loaded() {
  await waitFor(() =>
    expect(
      screen.queryByText("portal.infrastructure.encryption.coverage.heading"),
    ).not.toBeNull(),
  );
}

test("does not poll when no migration is running", async () => {
  mount(<EncryptionPanel />);
  await loaded();
  const afterLoad = migration.mock.calls.length;

  await polls(5);

  expect(migration).toHaveBeenCalledTimes(afterLoad);
});

test("polls progress while a migration runs", async () => {
  migration.mockResolvedValue(migrationStatus("RUNNING"));
  mount(<EncryptionPanel />);
  await loaded();
  const afterLoad = migration.mock.calls.length;

  await polls(3);

  expect(migration.mock.calls.length).toBeGreaterThan(afterLoad + 2);
});

test("re-reads the coverage counts once the run finishes", async () => {
  migration.mockResolvedValue(migrationStatus("RUNNING"));
  mount(<EncryptionPanel />);
  await loaded();
  const statusReads = status.mock.calls.length;

  migration.mockResolvedValue(migrationStatus("COMPLETED", 10));
  await polls(1);

  // The run changed the encrypted/plaintext split, so the card must not keep
  // its pre-run counts.
  await waitFor(() =>
    expect(status.mock.calls.length).toBeGreaterThan(statusReads),
  );
});

test("stops polling once the run is no longer active", async () => {
  migration.mockResolvedValue(migrationStatus("RUNNING"));
  mount(<EncryptionPanel />);
  await loaded();

  migration.mockResolvedValue(migrationStatus("COMPLETED", 10));
  await polls(2);
  const settled = migration.mock.calls.length;

  await polls(5);

  expect(migration).toHaveBeenCalledTimes(settled);
});

test("a failed poll leaves the run on screen for the next tick", async () => {
  migration.mockResolvedValue(migrationStatus("RUNNING"));
  mount(<EncryptionPanel />);
  await loaded();

  migration.mockRejectedValue(new Error("network"));
  await polls(2);
  const failed = migration.mock.calls.length;

  // Still polling: a transient failure must not be read as the run having ended.
  await polls(2);
  expect(migration.mock.calls.length).toBeGreaterThan(failed);
});

test("stops reading while the tab is hidden, and resumes on the next tick", async () => {
  migration.mockResolvedValue(migrationStatus("RUNNING"));
  mount(<EncryptionPanel />);
  await loaded();
  await polls(1);
  const beforeHide = migration.mock.calls.length;

  setTabHidden(true);
  await polls(30);
  expect(migration).toHaveBeenCalledTimes(beforeHide);

  setTabHidden(false);
  await polls(1);
  expect(migration.mock.calls.length).toBe(beforeHide + 1);
});
