import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { useGroupEnabled } from "@app/hooks/useGroupEnabled";
import { fetchGroupEnabled } from "@app/api/config";

vi.mock("@app/api/config", () => ({ fetchGroupEnabled: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

// useSyncExternalStore requires getSnapshot to return a stable (===) object
// between notified re-renders. We cache it here and only swap on status change
// to avoid the "The result of getSnapshot should be cached" infinite loop.
let status = "online";
let cachedSnapshot = { status };
const listeners = new Set<() => void>();

vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => cachedSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));

function setStatus(next: string) {
  status = next;
  cachedSnapshot = { status }; // new object reference so useSyncExternalStore detects the change
  act(() => listeners.forEach((l) => l()));
}

const mockFetch = vi.mocked(fetchGroupEnabled);

describe("desktop useGroupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = "online";
    cachedSnapshot = { status };
  });

  it("skips the request entirely when the server is offline", async () => {
    setStatus("offline");

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.unavailableReason).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reflects the server going offline after a successful check", async () => {
    mockFetch.mockResolvedValue(true);

    const { result } = renderHook(() => useGroupEnabled("ImageMagick"), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    setStatus("offline");

    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(result.current.unavailableReason).toBeTruthy();
  });
});
