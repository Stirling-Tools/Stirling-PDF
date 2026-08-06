import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import { useGroupEnabled } from "@app/hooks/useGroupEnabled";
import { fetchGroupEnabled } from "@app/api/config";

vi.mock("@app/api/config", () => ({ fetchGroupEnabled: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
}));

let status = "online";
const listeners = new Set<() => void>();

vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => ({ status }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));

function setStatus(next: string) {
  status = next;
  act(() => listeners.forEach((l) => l()));
}

const mockFetch = vi.mocked(fetchGroupEnabled);

describe("desktop useGroupEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = "online";
  });

  it("skips the request entirely when the server is offline", async () => {
    status = "offline";

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

    expect(result.current.enabled).toBe(false);
    expect(result.current.unavailableReason).toBeTruthy();
  });
});
