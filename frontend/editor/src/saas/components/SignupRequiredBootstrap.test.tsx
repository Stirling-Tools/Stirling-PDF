import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupRequiredBootstrap from "@app/components/SignupRequiredBootstrap";
import { ChatFAB } from "@app/components/chat/ChatFAB";
import { useToolRunComplete } from "@app/hooks/useToolRunComplete";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";
import { QuickNavRailHost } from "@app/components/shared/quickNav/QuickNavRailHost";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";

const auth = vi.hoisted(() => ({
  isAnonymous: true,
  user: { id: "guest-signup-test" },
}));
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
vi.mock("@app/components/chat/ChatContext", () => ({
  useChat: () => ({ isLoading: false }),
}));
vi.mock("@app/components/chat/ChatPanel", () => ({ ChatPanel: () => null }));
vi.mock("@app/components/policies/ProcessingFolderSetupFlow", () => ({
  ProcessingFolderSetupFlow: () => <div>Processing folder wizard</div>,
}));
vi.mock("@app/hooks/useAiEngineEnabled", () => ({
  useAiEngineEnabled: () => true,
}));
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

function GuestActions() {
  const complete = useToolRunComplete();
  const folder = useProcessingFolderCreation();
  return (
    <>
      <button onClick={complete}>Complete tool run</button>
      <button onClick={folder.open}>Landing page processing folder</button>
      {folder.dialog}
    </>
  );
}

function renderPrompt(withRail = false, withChat = false, withActions = false) {
  return render(
    <MemoryRouter initialEntries={["/editor?tool=compress"]}>
      <MantineProvider>
        <SignupRequiredBootstrap />
        {withRail && <QuickNavRailHost />}
        {withChat && <ChatFAB />}
        {withActions && <GuestActions />}
        <Destination />
      </MantineProvider>
    </MemoryRouter>,
  );
}

describe("guest signup prompt", () => {
  beforeEach(() => {
    auth.isAnonymous = true;
    localStorage.clear();
  });

  it("opens the Processor signup modal from the enabled guest rail without navigating", async () => {
    renderPrompt(true);
    const processor = screen.getByRole("button", { name: "Processor" });
    expect(processor).toBeEnabled();
    fireEvent.click(processor);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Create an account to unlock the best of Stirling"),
    ).toBeInTheDocument();
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

  it("opens signup instead of the assistant for guests without navigating", async () => {
    renderPrompt(false, true);
    const assistant = screen.getByRole("button", {
      name: "Open Stirling AI assistant",
    });
    fireEvent.click(assistant);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(assistant).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/editor?tool=compress",
    );
  });

  it("opens the assistant without a signup prompt for registered users", () => {
    auth.isAnonymous = false;
    renderPrompt(false, true);
    const assistant = screen.getByRole("button", {
      name: "Open Stirling AI assistant",
    });
    fireEvent.click(assistant);
    expect(assistant).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reminds after every two runs, permits dismissal and preserves the login destination", async () => {
    renderPrompt(false, false, true);
    const complete = screen.getByRole("button", { name: "Complete tool run" });
    fireEvent.click(complete);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(complete);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(complete);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(complete);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/login?next=%2Feditor%3Ftool%3Dcompress",
    );
  });

  it("prompts guests from the quick access processing folder action without navigating", async () => {
    renderPrompt(true);
    fireEvent.click(
      screen.getByRole("button", { name: "processingFolders.setup.title" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("destination")).toHaveTextContent(
      "/editor?tool=compress",
    );
  });

  it("prompts guests from landing-page folder creation without mounting setup", async () => {
    renderPrompt(false, false, true);
    fireEvent.click(
      screen.getByRole("button", { name: "Landing page processing folder" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("Processing folder wizard"),
    ).not.toBeInTheDocument();
  });

  it("lets registered users open folder setup without a signup prompt", async () => {
    auth.isAnonymous = false;
    renderPrompt(false, false, true);
    fireEvent.click(
      screen.getByRole("button", { name: "Landing page processing folder" }),
    );
    expect(
      await screen.findByText("Processing folder wizard"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      screen.getByText("Create an account to unlock the best of Stirling"),
    ).toBeInTheDocument();
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
