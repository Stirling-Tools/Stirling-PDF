import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupRequiredBootstrap from "@app/components/SignupRequiredBootstrap";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";

const auth = vi.hoisted(() => ({ isAnonymous: true }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@app/contexts/QuickNavHostContext", () => ({
  useQuickNavHost: () => ({
    appMounted: true,
    isAnonymous: auth.isAnonymous,
    portalAccess: false,
    actions: { current: {} },
  }),
}));
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/components/shared/quickNav/QuickNavRailContainer", () => ({
  QuickNavRailContainer: ({ groups }: { groups: QuickNavEntry[][] }) => (
    <>
      {groups.flat().map((entry) => (
        <button
          key={entry.id}
          disabled={entry.disabled}
          onClick={entry.onClick}
        >
          {entry.label}
        </button>
      ))}
    </>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback = key, options?: { count?: number }) =>
      fallback.replace("{{count}}", String(options?.count ?? "")),
  }),
}));

function Destination() {
  const location = useLocation();
  return (
    <output data-testid="destination">
      {location.pathname + location.search}
    </output>
  );
}

function renderPrompt(withRail = false) {
  return render(
    <MemoryRouter initialEntries={["/editor?tool=compress"]}>
      <MantineProvider>
        <SignupRequiredBootstrap />
        {withRail && <QuickNavRailHost />}
        <Destination />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe("guest signup prompt", () => {
  beforeEach(() => {
    auth.isAnonymous = true;
  });

  it("opens the Processor signup modal from the enabled guest rail without navigating", async () => {
    renderPrompt(true);
    const processor = screen.getByRole("button", { name: "Processor" });
    expect(processor).toBeEnabled();
    fireEvent.click(processor);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Unlock Processor")).toBeInTheDocument();
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/editor?tool=compress",
    );
  });

  it("keeps Processor disabled for registered users without access", () => {
    auth.isAnonymous = false;
    renderPrompt(true);
    expect(screen.getByRole("button", { name: "Processor" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains the five-run limit and preserves the destination when logging in", async () => {
    renderPrompt();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("payg:signupRequired", {
          detail: {
            category: "TOOLS",
            reason: "GUEST_TOOL_LIMIT_REACHED",
            limit: 5,
          },
        }),
      ),
    );
    expect(
      await screen.findByText(/used your 5 free guest runs/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/login?next=%2Feditor%3Ftool%3Dcompress",
    );
  });

  it("promotes Processor and deduplicates simultaneous blocked requests", async () => {
    renderPrompt();
    act(() => {
      for (let i = 0; i < 2; i++)
        window.dispatchEvent(
          new CustomEvent("payg:signupRequired", {
            detail: { category: "AI" },
          }),
        );
    });
    expect(await screen.findAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Unlock Processor")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Create free account" }),
    );
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/signup?next=%2Feditor%3Ftool%3Dcompress",
    );
  });

  it("does not show a guest prompt for an upgraded account", () => {
    auth.isAnonymous = false;
    renderPrompt();
    act(() =>
      window.dispatchEvent(
        new CustomEvent("payg:signupRequired", { detail: { category: "AI" } }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
