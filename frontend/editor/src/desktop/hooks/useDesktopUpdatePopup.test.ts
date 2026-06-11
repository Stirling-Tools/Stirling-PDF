import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";

// ── Mocks (hoisted by vi.mock) ──────────────────────────────────────────────
const invokeMock = vi.fn();
const listenMock = vi.fn();
const getVersionMock = vi.fn();
const getUpdateModeMock = vi.fn();
const canInstallUpdatesMock = vi.fn();
const getUpdateSummaryMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: unknown) => listenMock(event, cb),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => getVersionMock(),
}));

vi.mock("@app/services/updateService", () => ({
  updateService: {
    getUpdateSummary: (...args: unknown[]) => getUpdateSummaryMock(...args),
    compareVersions: (a: string, b: string) => (a === b ? 0 : a > b ? 1 : -1),
  },
}));

vi.mock("@app/services/desktopUpdateService", () => ({
  desktopUpdateService: {
    getUpdateMode: () => getUpdateModeMock(),
    canInstallUpdates: () => canInstallUpdatesMock(),
  },
}));

import { useDesktopUpdatePopup } from "@app/hooks/useDesktopUpdatePopup";

/** Flush pending microtasks so awaited promises settle. */
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

const AUTO_FAILURE_KEY = "stirling-pdf-updater:autoFailedAt";

/**
 * Run the hook through its startup timer + async chain. The post-render
 * timer-driven async work is wrapped in act() so the state updates it
 * triggers don't surface as React "not wrapped in act" warnings.
 * renderHook already wraps the initial render in act internally, so it
 * stays outside.
 */
async function runStartup() {
  renderHook(() => useDesktopUpdatePopup());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16_000);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
  });
}

describe("useDesktopUpdatePopup — auto mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    invokeMock.mockReset();
    listenMock.mockReset();
    getVersionMock.mockReset();
    getUpdateModeMock.mockReset();
    canInstallUpdatesMock.mockReset();
    getUpdateSummaryMock.mockReset();

    // Defaults: auto mode, update available, install permitted.
    getUpdateModeMock.mockResolvedValue("auto");
    getVersionMock.mockResolvedValue("1.0.0");
    getUpdateSummaryMock.mockResolvedValue({ latest_version: "2.0.0" });
    canInstallUpdatesMock.mockResolvedValue({
      canInstall: true,
      reason: null,
      installDir: "C:/Program Files/Stirling-PDF",
    });
    listenMock.mockResolvedValue(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT call restart_app when download_and_install_update fails", async () => {
    expectConsole.error(/\[useDesktopInstall\] Install failed/);
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "check_for_update") {
        return Promise.resolve({
          version: "2.0.0",
          currentVersion: "1.0.0",
          releaseNotes: null,
        });
      }
      if (cmd === "download_and_install_update") {
        return Promise.reject(new Error("signature mismatch"));
      }
      return Promise.resolve();
    });

    await runStartup();

    const invocations = invokeMock.mock.calls.map((c) => c[0]);
    expect(invocations).toContain("download_and_install_update");
    expect(invocations).not.toContain("restart_app");

    // Failure must be persisted so the next launch backs off instead of
    // re-attempting a known-broken install.
    expect(window.localStorage.getItem(AUTO_FAILURE_KEY)).not.toBeNull();
  });

  it("calls restart_app when download_and_install_update succeeds", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "check_for_update") {
        return Promise.resolve({
          version: "2.0.0",
          currentVersion: "1.0.0",
          releaseNotes: null,
        });
      }
      // download_and_install_update + restart_app both resolve.
      return Promise.resolve();
    });
    // Pre-seed a stale failure timestamp — a successful install must clear it.
    window.localStorage.setItem(AUTO_FAILURE_KEY, "1");

    await runStartup();

    const invocations = invokeMock.mock.calls.map((c) => c[0]);
    expect(invocations).toContain("download_and_install_update");
    expect(invocations).toContain("restart_app");
    expect(window.localStorage.getItem(AUTO_FAILURE_KEY)).toBeNull();
  });

  it("skips the install entirely when a recent failure is within the backoff window", async () => {
    expectConsole.warn(
      /\[DesktopUpdatePopup\] auto-update skipped: recent failure within backoff window/,
    );
    // Recorded 1 hour ago — well inside the 6-hour backoff.
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    window.localStorage.setItem(AUTO_FAILURE_KEY, String(oneHourAgo));

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "check_for_update") {
        return Promise.resolve({
          version: "2.0.0",
          currentVersion: "1.0.0",
          releaseNotes: null,
        });
      }
      return Promise.resolve();
    });

    await runStartup();

    const invocations = invokeMock.mock.calls.map((c) => c[0]);
    expect(invocations).not.toContain("download_and_install_update");
    expect(invocations).not.toContain("restart_app");
  });

  it("attempts the install again once the backoff has elapsed", async () => {
    // Recorded 7 hours ago — past the 6-hour backoff.
    const sevenHoursAgo = Date.now() - 7 * 60 * 60 * 1000;
    window.localStorage.setItem(AUTO_FAILURE_KEY, String(sevenHoursAgo));

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "check_for_update") {
        return Promise.resolve({
          version: "2.0.0",
          currentVersion: "1.0.0",
          releaseNotes: null,
        });
      }
      return Promise.resolve();
    });

    await runStartup();

    const invocations = invokeMock.mock.calls.map((c) => c[0]);
    expect(invocations).toContain("download_and_install_update");
    expect(invocations).toContain("restart_app");
  });
});
