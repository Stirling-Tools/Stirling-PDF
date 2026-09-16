import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupRequiredBootstrap from "@app/components/SignupRequiredBootstrap";

const auth = vi.hoisted(() => ({ isAnonymous: true }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: { count?: number }) =>
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

function renderPrompt() {
  return render(
    <MemoryRouter initialEntries={["/editor?tool=compress"]}>
      <MantineProvider>
        <SignupRequiredBootstrap />
        <Destination />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe("guest signup prompt", () => {
  beforeEach(() => {
    auth.isAnonymous = true;
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
      await screen.findByText(/reached your 5 free guest tool runs/),
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
    expect(
      screen.getByText("Unlock Processor with a free account"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign up free" }));
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
