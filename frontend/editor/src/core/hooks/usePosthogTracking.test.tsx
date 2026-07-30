import { ReactNode, useState } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

const posthogState = vi.hoisted(() => ({ loaded: false }));
const posthogMock = vi.hoisted(() => ({
  get __loaded() {
    return posthogState.loaded;
  },
  init: vi.fn(() => {
    posthogState.loaded = true;
  }),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  set_config: vi.fn(),
  has_opted_in_capturing: vi.fn(() => false),
}));

vi.mock("posthog-js", () => ({
  default: posthogMock,
}));

import { usePosthogTracking } from "@app/hooks/usePosthogTracking";

function createWrapper(enableAnalytics: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(
      () =>
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
    );
    return (
      <QueryClientProvider client={client}>
        <AppConfigProvider
          initialConfig={{ enableAnalytics }}
          bootstrapMode="non-blocking"
          autoFetch={false}
        >
          {children}
        </AppConfigProvider>
      </QueryClientProvider>
    );
  };
}

describe("usePosthogTracking", () => {
  beforeEach(() => {
    posthogState.loaded = false;
    posthogMock.init.mockClear();
    posthogMock.opt_out_capturing.mockClear();
    posthogMock.opt_in_capturing.mockClear();
    posthogMock.set_config.mockClear();
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "test-key");
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not initialize PostHog when analytics is disabled", async () => {
    renderHook(() => usePosthogTracking(), {
      wrapper: createWrapper(false),
    });

    await waitFor(() => {
      expect(posthogMock.init).not.toHaveBeenCalled();
    });
  });

  it("initializes PostHog when analytics is enabled", async () => {
    renderHook(() => usePosthogTracking(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => {
      expect(posthogMock.init).toHaveBeenCalledTimes(1);
    });
  });
});
