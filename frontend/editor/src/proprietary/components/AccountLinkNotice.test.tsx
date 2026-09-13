import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { AccountLinkNotice } from "@app/components/AccountLinkNotice";
import {
  clearAccountLinkBlock,
  reportFreeTierExhausted,
} from "@app/services/accountLinkBlock";

const { alert, dismissToast } = vi.hoisted(() => ({
  alert: vi.fn(),
  dismissToast: vi.fn(),
}));

vi.mock("@app/auth", () => ({
  useAuth: () => ({ isAdmin: true, loading: false }),
}));
vi.mock("@app/components/toast", () => ({ alert, dismissToast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
vi.mock("@app/ui", async () => ({
  ...(await import("@app/ui/Button")),
  ...(await import("@app/ui/Modal")),
}));

function LocationProbe() {
  const location = useLocation();
  return <output>{JSON.stringify(location)}</output>;
}

function mount(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <AccountLinkNotice />
        <LocationProbe />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("editor account-link notice routing", () => {
  beforeEach(() => {
    clearAccountLinkBlock();
    vi.clearAllMocks();
  });

  it.each(["/processor", "/settings/billing", "/settings/account-link"])(
    "leaves %s to its existing link dialog",
    (path) => {
      mount(path);
      act(() => reportFreeTierExhausted());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(alert).not.toHaveBeenCalled();
    },
  );

  it("carries an explicit prompt request to the Processor destination", () => {
    mount("/editor");
    act(() => reportFreeTierExhausted());
    fireEvent.click(
      screen.getByRole("button", { name: "View linking options" }),
    );
    const location = JSON.parse(screen.getByRole("status").textContent ?? "{}");
    expect(location.pathname).toBe("/processor");
    expect(location.state).toEqual({ accountLinkPrompt: "exhausted" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps background failures in a persistent actionable notice", () => {
    mount("/editor");
    act(() => reportFreeTierExhausted("background"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({
        isPersistentPopup: true,
        buttonText: "View linking options",
      }),
    );
  });
});
