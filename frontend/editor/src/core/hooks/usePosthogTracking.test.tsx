import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";

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
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider
          initialConfig={{ enableAnalytics: false }}
          bootstrapMode="non-blocking"
          autoFetch={false}
        >
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
    );

    renderHook(() => usePosthogTracking(), { wrapper });

    // PostHog loads asynchronously, so a load the gate wrongly let through lands
    // after the render. Give it the time the enabled case takes before asserting
    // it never happened: a waitFor on the negative passes on its first check.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it("initializes PostHog when analytics is enabled", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestQueryProvider>
        <AppConfigProvider
          initialConfig={{ enableAnalytics: true }}
          bootstrapMode="non-blocking"
          autoFetch={false}
        >
          {children}
        </AppConfigProvider>
      </TestQueryProvider>
    );

    renderHook(() => usePosthogTracking(), { wrapper });

    await waitFor(() => {
      expect(posthogMock.init).toHaveBeenCalledTimes(1);
    });
  });
});
