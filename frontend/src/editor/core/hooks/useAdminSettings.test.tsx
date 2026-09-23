import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAdminSettings } from "@app/hooks/useAdminSettings";
import { qk } from "@app/query/keys";
import {
  fetchAdminSection,
  putAdminSection,
  putAdminSettings,
} from "@app/api/adminSettings";

vi.mock("@app/api/adminSettings", () => ({
  fetchAdminSection: vi.fn(),
  putAdminSection: vi.fn(),
  putAdminSettings: vi.fn(),
}));

const mockFetch = vi.mocked(fetchAdminSection);
const mockPutSection = vi.mocked(putAdminSection);
const mockPutSettings = vi.mocked(putAdminSettings);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAdminSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ appName: "Stirling" });
    mockPutSection.mockResolvedValue(undefined);
    mockPutSettings.mockResolvedValue(undefined);
  });

  it("loads the section and seeds the editable draft", async () => {
    const { result } = renderHook(
      () => useAdminSettings({ sectionName: "general" }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({ appName: "Stirling" });
    expect(mockFetch).toHaveBeenCalledWith("general");
  });

  it("shares one fetch between sections reading the same block", async () => {
    const { result } = renderHook(
      () => ({
        a: useAdminSettings({ sectionName: "aiEngine" }),
        b: useAdminSettings({ sectionName: "aiEngine" }),
        c: useAdminSettings({ sectionName: "aiEngine" }),
      }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("serves a reopened tab from cache within the stale window", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    for (let i = 0; i < 4; i++) {
      const tab = renderHook(
        () => useAdminSettings({ sectionName: "aiEngine" }),
        { wrapper: shared },
      );
      await waitFor(() => expect(tab.result.current.loading).toBe(false));
      tab.unmount();
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps sections with different blocks apart", async () => {
    const { result } = renderHook(
      () => ({
        a: useAdminSettings({ sectionName: "general" }),
        b: useAdminSettings({ sectionName: "security" }),
      }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.a.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith("general");
    expect(mockFetch).toHaveBeenCalledWith("security");
  });

  it("does not fetch while disabled, and reports itself unloaded", async () => {
    const { result } = renderHook(
      () => useAdminSettings({ sectionName: "general", enabled: false }),
      {
        wrapper: makeWrapper(),
      },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    // Sections gate their render on this; false would show an empty form.
    expect(result.current.loading).toBe(true);
  });

  it("fetches when the gate opens", async () => {
    const { result, rerender } = renderHook(
      ({ on }: { on: boolean }) =>
        useAdminSettings({ sectionName: "general", enabled: on }),
      { wrapper: makeWrapper(), initialProps: { on: false } },
    );

    expect(mockFetch).not.toHaveBeenCalled();
    rerender({ on: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends only changed fields", async () => {
    mockFetch.mockResolvedValue({ appName: "Stirling", theme: "dark" });
    const { result } = renderHook(
      () =>
        useAdminSettings<{ appName: string; theme: string }>({
          sectionName: "general",
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSettings({ appName: "Renamed", theme: "dark" });
    });
    await act(async () => {
      await result.current.saveSettings();
    });

    expect(mockPutSection).toHaveBeenCalledWith("general", {
      appName: "Renamed",
    });
  });

  it("skips the request when nothing changed", async () => {
    const { result } = renderHook(
      () => useAdminSettings({ sectionName: "general" }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveSettings();
    });

    expect(mockPutSection).not.toHaveBeenCalled();
  });

  it("refetches after a save so the _pending block is current", async () => {
    mockFetch.mockResolvedValue({ appName: "Stirling" });
    const { result } = renderHook(
      () => useAdminSettings<{ appName: string }>({ sectionName: "general" }),
      {
        wrapper: makeWrapper(),
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockResolvedValue({
      appName: "Stirling",
      _pending: { appName: "Renamed" },
    });
    act(() => {
      result.current.setSettings({ appName: "Renamed" });
    });
    await act(async () => {
      await result.current.saveSettings();
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.hasPendingChanges()).toBe(true));
  });

  it("surfaces pending values in the draft and flags the field", async () => {
    mockFetch.mockResolvedValue({
      appName: "Stirling",
      _pending: { appName: "Queued" },
    });
    const { result } = renderHook(
      () => useAdminSettings<{ appName: string }>({ sectionName: "general" }),
      {
        wrapper: makeWrapper(),
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // The draft shows the queued value, not the active one.
    expect(result.current.settings.appName).toBe("Queued");
    expect(result.current.isFieldPending("appName")).toBe(true);
  });

  it("resets the draft when a fetch delivers new values", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => useAdminSettings<{ appName: string }>({ sectionName: "general" }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSettings({ appName: "Half-typed" });
    });
    expect(result.current.settings.appName).toBe("Half-typed");

    mockFetch.mockResolvedValue({ appName: "From server" });
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.adminSection("general") });
    });

    // A fetch is authoritative over the draft.
    await waitFor(() =>
      expect(result.current.settings.appName).toBe("From server"),
    );
  });

  it("does not clobber an in-progress edit on re-render", async () => {
    const { result, rerender } = renderHook(
      () => useAdminSettings<{ appName: string }>({ sectionName: "general" }),
      {
        wrapper: makeWrapper(),
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSettings({ appName: "Half-typed" });
    });
    rerender();
    rerender();

    expect(result.current.settings.appName).toBe("Half-typed");
  });

  it("routes transformer output to both endpoints", async () => {
    mockFetch.mockResolvedValue({ a: 1, b: 2 });
    const { result } = renderHook(
      () =>
        useAdminSettings<{ a: number; b: number }>({
          sectionName: "general",
          saveTransformer: (s) => ({
            sectionData: { a: s.a },
            deltaSettings: { "some.flat.path": s.b },
          }),
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSettings({ a: 9, b: 8 });
    });
    await act(async () => {
      await result.current.saveSettings();
    });

    expect(mockPutSection).toHaveBeenCalledWith("general", { a: 9 });
    expect(mockPutSettings).toHaveBeenCalledWith({ "some.flat.path": 8 });
  });

  it("reports saving while the save is in flight", async () => {
    const { result } = renderHook(
      () => useAdminSettings<{ appName: string }>({ sectionName: "general" }),
      {
        wrapper: makeWrapper(),
      },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let release: () => void = () => {};
    mockPutSection.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    act(() => {
      result.current.setSettings({ appName: "Renamed" });
    });
    let done: Promise<void>;
    act(() => {
      done = result.current.saveSettings();
    });
    await waitFor(() => expect(result.current.saving).toBe(true));

    await act(async () => {
      release();
      await done;
    });
    await waitFor(() => expect(result.current.saving).toBe(false));
  });
});
