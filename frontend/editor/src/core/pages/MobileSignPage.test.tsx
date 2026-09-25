/**
 * Session-state contract for the phone-side signature page: a missing or
 * expired session shows one clear error instead of a canvas whose Send would
 * fail; a valid session shows the draw/type/photo tabs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import MobileSignPage from "@app/pages/MobileSignPage";

vi.mock("@app/services/apiClient", () => ({
  default: { defaults: { baseURL: "http://localhost:8080" } },
}));

// Render the English fallbacks the assertions read (the test i18n instance
// has no loaded locale, so bare t() would render raw keys).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

// Branding components pull theme preferences from providers this page doesn't
// need for its session-state contract.
vi.mock("@app/components/shared/LogoIcon", () => ({
  LogoIcon: () => <span data-testid="logo" />,
}));
vi.mock("@app/components/shared/Wordmark", () => ({
  Wordmark: () => <span data-testid="wordmark" />,
}));

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <MobileSignPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("MobileSignPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // jsdom has no ResizeObserver; the draw canvas sizes itself with one.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // jsdom's canvas has no real 2d context (and logs an error when asked);
    // the draw canvas tolerates a null context.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the expired-session error when the URL has no session", async () => {
    renderAt("/mobile-sign");

    await waitFor(() =>
      expect(screen.getByText(/Session expired/i)).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the expired-session error when the backend rejects the session", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ valid: false }),
    } as Response);

    renderAt("/mobile-sign?session=stale-session");

    await waitFor(() =>
      expect(screen.getByText(/Session expired/i)).toBeInTheDocument(),
    );
  });

  it("shows the signature tabs once the session validates", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true }),
    } as Response);

    renderAt("/mobile-sign?session=good-session");

    await waitFor(() => expect(screen.getByText("Draw")).toBeInTheDocument());
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Photo")).toBeInTheDocument();
    expect(screen.getByText(/Send to computer/i)).toBeInTheDocument();
  });
});
