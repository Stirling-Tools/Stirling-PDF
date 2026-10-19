import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerSetupGate } from "@app/components/startup/ServerSetupGate";
import * as api from "@app/components/serverSetup/serverSetupApi";
import { alert } from "@app/components/toast";

/** A stand-in for the server's app-config: it reports setup done once marked so. */
const server = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    config: {} as Record<string, unknown>,
    loading: false,
    setupMarkedComplete: false,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      listeners.forEach((listener) => listener());
    },
    refetch() {
      if (state.setupMarkedComplete) {
        state.config = { ...state.config, setupCompleted: true };
        listeners.forEach((listener) => listener());
      }
      return Promise.resolve();
    },
  };
  return state;
});
vi.mock("@app/contexts/AppConfigContext", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAppConfig: () => ({
      config: useSyncExternalStore(server.subscribe, () => server.config),
      loading: useSyncExternalStore(server.subscribe, () => server.loading),
      refetch: server.refetch,
    }),
  };
});
vi.mock(
  "@app/components/serverSetup/serverSetupApi",
  async (importOriginal) => ({
    httpStatus: (
      await importOriginal<
        typeof import("@app/components/serverSetup/serverSetupApi")
      >()
    ).httpStatus,
    fetchServerSettings: vi.fn(),
    saveServerSettings: vi.fn(),
    answerAnalytics: vi.fn(),
    markSetupComplete: vi.fn(),
    requestRestart: vi.fn(),
    waitForServer: vi.fn(),
    checkIssuer: vi.fn(),
    changeAdminPassword: vi.fn(),
    changeAdminUsername: vi.fn(),
  }),
);
const auth = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  user: { username: "admin" },
}));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("@app/auth/spring/springAuthClient", () => ({
  springAuth: { signInWithPassword: signIn },
}));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      options: Record<string, unknown> = {},
    ) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options[name]),
      ),
  }),
}));

const NEW_SERVER_SETTINGS = {
  system: { frontendUrl: "", backendUrl: "", enableAnalytics: null },
  security: { oauth2: { enabled: false } },
  mail: { enabled: false },
  storage: { enabled: true, sharing: { enabled: false } },
  aiEngine: {
    enabled: false,
    url: "http://localhost:5001",
    models: {},
    rag: { embeddingProvider: "voyageai", embeddingModel: "voyage-4" },
    features: { documentQuestions: true },
  },
  mcp: { enabled: false, auth: { mode: "oauth" } },
};

function renderGate(
  passwordChange?: { usingDefaultCredentials: boolean },
  onPasswordChanged = vi.fn(),
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <ServerSetupGate
          passwordChange={passwordChange}
          onPasswordChanged={onPasswordChanged}
        >
          <div>The app</div>
        </ServerSetupGate>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

const group = (name: string) => screen.getByRole("group", { name });

/** Collapsed fields stay mounted so they can animate; read their panel. */
const isShown = (name: RegExp) => {
  const panel = screen.getByRole("textbox", { name }).closest("[data-open]");
  return (
    panel?.getAttribute("data-open") === "true" && !panel.hasAttribute("inert")
  );
};

async function openQuickStart() {
  await screen.findByRole("heading", { name: "Your server is up" });
  click("Continue");
}

beforeEach(() => {
  vi.clearAllMocks();
  server.config = { enableLogin: true, isAdmin: true, setupCompleted: false };
  server.setupMarkedComplete = false;
  server.loading = false;
  sessionStorage.clear();
  vi.mocked(api.fetchServerSettings).mockResolvedValue(NEW_SERVER_SETTINGS);
  vi.mocked(api.requestRestart).mockResolvedValue("unsupported");
  vi.mocked(api.checkIssuer).mockResolvedValue(true);
  vi.mocked(api.markSetupComplete).mockImplementation(async () => {
    server.setupMarkedComplete = true;
  });
});

describe("ServerSetupGate", () => {
  it("shows the app once setup is done", () => {
    server.config.setupCompleted = true;
    renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("holds the sign-in card, not the app, while the first config loads", async () => {
    sessionStorage.setItem("stirling.setupSignInHandoff", String(Date.now()));
    server.config = {};
    server.loading = true;
    renderGate();
    expect(
      screen.getByRole("heading", {
        name: "Signing in with default credentials",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();

    act(() => {
      server.config = {
        enableLogin: true,
        isAdmin: true,
        setupCompleted: true,
      };
      server.loading = false;
      server.notify();
    });
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(sessionStorage.getItem("stirling.setupSignInHandoff")).toBeNull();
  });

  it("never shows setup when login is off", () => {
    server.config = {
      enableLogin: false,
      isAdmin: true,
      setupCompleted: false,
    };
    renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("only shows setup to admins", () => {
    server.config.isAdmin = false;
    renderGate();
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("records setup as done when the admin chooses Not now", async () => {
    renderGate();
    await screen.findByRole("heading", { name: "Your server is up" });
    click("Not now");
    await screen.findByText("The app");
    expect(api.markSetupComplete).toHaveBeenCalled();
    expect(api.saveServerSettings).not.toHaveBeenCalled();
  });

  it("keeps setup up until the server says it is done", async () => {
    vi.mocked(api.markSetupComplete).mockRejectedValue(new Error("offline"));
    renderGate();
    await screen.findByRole("heading", { name: "Your server is up" });
    click("Not now");
    await waitFor(() => expect(api.markSetupComplete).toHaveBeenCalled());
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("records setup as done from the load error card too", async () => {
    vi.mocked(api.fetchServerSettings).mockRejectedValue(new Error("offline"));
    renderGate();
    await screen.findByRole("heading", { name: "Couldn't load your settings" });
    click("Not now");
    await screen.findByText("The app");
    expect(api.markSetupComplete).toHaveBeenCalled();
  });

  it("saves Quick start's summary in one write, then restarts", async () => {
    renderGate();
    await screen.findByRole("heading", { name: "Your server is up" });
    expect(screen.queryByText("Sign in with")).toBeNull();
    click("Continue");
    expect(
      screen.getByRole("heading", { name: "Quick start" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    click("Continue");

    // Analytics starts on, so its button accepts; turning it off declines.
    expect(
      screen.getByRole("heading", { name: "Analytics" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(
      screen.getByRole("button", { name: "Decline and finish" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "On" }));
    click("Accept and finish");

    await screen.findByRole("heading", { name: "Settings saved" });
    expect(api.saveServerSettings).toHaveBeenCalledWith({
      "system.frontendUrl": window.location.origin,
      "system.backendUrl": window.location.origin,
      "mcp.enabled": true,
      "mcp.auth.mode": "apikey",
    });
    expect(api.answerAnalytics).toHaveBeenCalledWith(true);
    expect(api.requestRestart).toHaveBeenCalled();
    expect(
      screen.getByText(/This server can't restart itself/),
    ).toBeInTheDocument();

    click("Continue");
    await screen.findByText("The app");
  });

  it("says so when a restart fails rather than being unsupported", async () => {
    vi.mocked(api.requestRestart).mockResolvedValue("failed");
    renderGate();
    await openQuickStart();
    click("Continue");
    click("Accept and finish");
    await screen.findByText(/The server didn't restart/);
  });

  it("checks the summary before moving on", async () => {
    renderGate();
    await openQuickStart();
    fireEvent.change(screen.getByRole("textbox", { name: /^Web address/ }), {
      target: { value: "pdf.example.com" },
    });
    click("Continue");

    expect(
      screen.getByText(
        "Enter a full address, starting with http:// or https://",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Quick start" }),
    ).toBeInTheDocument();
  });

  it("goes back to the first card and on into Custom", async () => {
    renderGate();
    await openQuickStart();
    click("Back");
    expect(
      screen.getByRole("heading", { name: "Your server is up" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    click("Continue");
    expect(screen.getByText("1 of 7")).toBeInTheDocument();
  });

  it("turns MCP on with API keys, whether or not AI is on", async () => {
    renderGate();
    await openQuickStart();
    expect(
      within(group("AI")).getByRole("radio", { name: "Off" }),
    ).toBeChecked();
    expect(
      within(group("MCP server")).getByRole("radio", { name: "On" }),
    ).toBeChecked();
    click("Continue");
    click("Accept and finish");

    await waitFor(() => expect(api.saveServerSettings).toHaveBeenCalled());
    expect(vi.mocked(api.saveServerSettings).mock.calls[0][0]).toMatchObject({
      "mcp.enabled": true,
      "mcp.auth.mode": "apikey",
    });
  });

  it("leaves MCP alone on a server that already runs it", async () => {
    vi.mocked(api.fetchServerSettings).mockResolvedValue({
      ...NEW_SERVER_SETTINGS,
      mcp: { enabled: true, auth: { mode: "oauth" } },
    });
    renderGate();
    await openQuickStart();
    click("Continue");
    click("Accept and finish");

    await waitFor(() => expect(api.saveServerSettings).toHaveBeenCalled());
    const saved = vi.mocked(api.saveServerSettings).mock.calls[0][0];
    expect(saved).not.toHaveProperty("mcp.enabled");
    expect(saved).not.toHaveProperty("mcp.auth.mode");
  });

  async function reachAccountStep() {
    await screen.findByRole("heading", { name: "Set up your account" });
  }

  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
      target: { value },
    });

  const fillAccount = (username: string, password = "a-new-pass") => {
    type("Username", username);
    type("New password", password);
    type("Confirm new password", password);
  };

  it("starts with the account, keeping the admin signed in", async () => {
    const onPasswordChanged = vi.fn();
    renderGate({ usingDefaultCredentials: true }, onPasswordChanged);
    await reachAccountStep();
    expect(screen.queryByLabelText(/^Current password/)).toBeNull();
    expect(screen.getByRole("textbox", { name: /^Username/ })).toHaveValue("");

    fillAccount("admin");
    click("Save and continue");

    await screen.findByRole("heading", { name: "Your server is up" });
    expect(api.changeAdminPassword).toHaveBeenCalledWith(
      "stirling",
      "a-new-pass",
    );
    expect(api.changeAdminUsername).not.toHaveBeenCalled();
    expect(onPasswordChanged).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Details saved" }),
    );
    // Refreshing reloads the app's auth state, so it waits until setup closes.
    expect(auth.refreshSession).not.toHaveBeenCalled();

    click("Continue");
    click("Continue"); // Quick start summary
    click("Accept and finish");
    await screen.findByRole("heading", { name: "Settings saved" });
    expect(api.changeAdminPassword).toHaveBeenCalledTimes(1);

    click("Continue");
    expect(auth.refreshSession).toHaveBeenCalled();
    await screen.findByText("The app");
  });

  it("renames the admin after the password, then signs straight back in", async () => {
    let finishSignIn: (value: unknown) => void = () => {};
    signIn.mockReturnValue(
      new Promise((resolve) => {
        finishSignIn = resolve;
      }),
    );
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("pdf-admin");
    click("Save and continue");

    expect(
      screen.getByRole("heading", { name: "Updating your details" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.changeAdminUsername).toHaveBeenCalledWith(
        "a-new-pass",
        "pdf-admin",
      ),
    );
    expect(
      vi.mocked(api.changeAdminPassword).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(api.changeAdminUsername).mock.invocationCallOrder[0],
    );
    expect(signIn).toHaveBeenCalledWith({
      email: "pdf-admin",
      password: "a-new-pass",
    });

    finishSignIn({ session: { access_token: "t" }, error: null });
    await screen.findByRole("heading", { name: "Your server is up" });
  });

  it("keeps the new password when only the username is refused", async () => {
    vi.mocked(api.changeAdminUsername)
      .mockRejectedValueOnce({
        response: { status: 409, data: { error: "usernameExists" } },
      })
      .mockResolvedValueOnce(undefined);
    signIn.mockResolvedValue({ session: { access_token: "t" }, error: null });
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("taken-name");
    click("Save and continue");

    await screen.findByText("That username is taken");
    type("Username", "free-name");
    click("Save and continue");

    await screen.findByRole("heading", { name: "Your server is up" });
    expect(api.changeAdminPassword).toHaveBeenCalledTimes(1);
    expect(api.changeAdminUsername).toHaveBeenLastCalledWith(
      "a-new-pass",
      "free-name",
    );
  });

  it("asks for a fresh sign-in when signing back in fails", async () => {
    signIn.mockResolvedValue({ session: null, error: { message: "nope" } });
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("pdf-admin");
    click("Save and continue");

    await screen.findByRole("heading", { name: "Your details are saved" });
    click("Sign in");
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("rotates the token when setup is put off after the account", async () => {
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("admin");
    click("Save and continue");
    await screen.findByRole("heading", { name: "Your server is up" });

    click("Not now");
    await waitFor(() => expect(auth.refreshSession).toHaveBeenCalled());
  });

  it("checks the details before saving them", async () => {
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("a", "short");
    type("Confirm new password", "other");
    click("Save and continue");

    expect(
      screen.getByText(/Use 3 to 50 letters, numbers/),
    ).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(api.changeAdminPassword).not.toHaveBeenCalled();
  });

  it("stays on the account card when the server refuses the password", async () => {
    vi.mocked(api.changeAdminPassword).mockRejectedValue({
      response: { status: 401, data: { error: "incorrectPassword" } },
    });
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("admin");
    click("Save and continue");

    await screen.findByText("Incorrect password");
    expect(api.changeAdminUsername).not.toHaveBeenCalled();
  });

  it("says so when the details could not be saved at all", async () => {
    vi.mocked(api.changeAdminPassword).mockRejectedValue(new Error("offline"));
    renderGate({ usingDefaultCredentials: true });
    await reachAccountStep();
    fillAccount("admin");
    click("Save and continue");

    await screen.findByText(/Couldn't save your details/);
    expect(
      screen.getByRole("heading", { name: "Set up your account" }),
    ).toBeInTheDocument();
  });

  it("keeps one expanded section open at a time", async () => {
    renderGate();
    await openQuickStart();

    fireEvent.click(
      within(group("Send email")).getByRole("radio", { name: "On" }),
    );
    expect(isShown(/^SMTP host/)).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Your own AI" }));
    expect(isShown(/^SMTP host/)).toBe(false);
    expect(isShown(/^AI engine address/)).toBe(true);

    click("Show Send email settings");
    expect(isShown(/^SMTP host/)).toBe(true);
    expect(isShown(/^AI engine address/)).toBe(false);
  });

  it("saves a section and opens the next one that is on", async () => {
    renderGate();
    await openQuickStart();
    fireEvent.click(screen.getByRole("radio", { name: "Your own AI" }));
    fireEvent.click(
      within(group("Send email")).getByRole("radio", { name: "On" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: /^SMTP host/ }), {
      target: { value: "smtp.example.org" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Port/ }), {
      target: { value: "587" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^From address/ }), {
      target: { value: "pdf@example.org" },
    });

    fireEvent.click(
      within(group("Send email")).getByRole("button", { name: "Save" }),
    );
    expect(isShown(/^SMTP host/)).toBe(false);
    expect(isShown(/^AI engine address/)).toBe(true);

    fireEvent.click(within(group("AI")).getByRole("button", { name: "Save" }));
    expect(isShown(/^Embedding model/)).toBe(true);

    fireEvent.click(
      within(group("Document questions")).getByRole("button", {
        name: "Save",
      }),
    );
    expect(isShown(/^Embedding model/)).toBe(false);
  });

  it("keeps a section open until its fields are filled in", async () => {
    renderGate();
    await openQuickStart();
    fireEvent.click(
      within(group("Send email")).getByRole("radio", { name: "On" }),
    );
    fireEvent.click(
      within(group("Send email")).getByRole("button", { name: "Save" }),
    );

    expect(isShown(/^SMTP host/)).toBe(true);
    expect(screen.getByRole("textbox", { name: /^SMTP host/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("asks for an embedding setup only while document questions are on", async () => {
    renderGate();
    await openQuickStart();
    expect(screen.queryByText("Document questions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Your own AI" }));
    fireEvent.click(
      within(group("Document questions")).getByRole("radio", { name: "Off" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: /^AI engine address/ }),
      { target: { value: "http://engine" } },
    );
    click("Continue");
    click("Accept and finish");

    await waitFor(() => expect(api.saveServerSettings).toHaveBeenCalled());
    const saved = vi.mocked(api.saveServerSettings).mock.calls[0][0];
    expect(saved).toMatchObject({
      "aiEngine.features.documentQuestions": false,
    });
    expect(saved).not.toHaveProperty("aiEngine.rag.embeddingModel");
  });

  it("won't move on with an issuer the server can't reach", async () => {
    vi.mocked(api.checkIssuer).mockResolvedValue(false);
    vi.mocked(api.fetchServerSettings).mockResolvedValue({
      ...NEW_SERVER_SETTINGS,
      security: {
        oauth2: {
          enabled: true,
          client: { keycloak: { clientId: "id", clientSecret: "secret" } },
        },
      },
    });
    renderGate();
    await openQuickStart();
    fireEvent.change(screen.getByRole("textbox", { name: /^Issuer URL/ }), {
      target: { value: "https://id.example.com" },
    });
    click("Continue");

    await screen.findByText(/Couldn't reach this issuer/);
    expect(api.checkIssuer).toHaveBeenCalledWith("https://id.example.com");
    expect(
      screen.getByRole("heading", { name: "Quick start" }),
    ).toBeInTheDocument();
  });

  it("starts Custom's AI card on, with its fields open", async () => {
    renderGate();
    await screen.findByRole("heading", { name: "Your server is up" });
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    click("Continue");
    for (let card = 1; card < 6; card += 1) click("Continue");

    expect(screen.getByRole("heading", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Your own AI" })).toBeChecked();
    expect(isShown(/^AI engine address/)).toBe(true);
  });

  it("drops Custom's AI default on a switch back to Quick start", async () => {
    renderGate();
    await screen.findByRole("heading", { name: "Your server is up" });
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    click("Continue");
    for (let card = 1; card < 6; card += 1) click("Continue");
    for (let card = 0; card < 6; card += 1) click("Back");

    fireEvent.click(screen.getByRole("radio", { name: "Quick start" }));
    click("Continue");
    expect(
      within(group("AI")).getByRole("radio", { name: "Off" }),
    ).toBeChecked();
  });

  it("opens a setting that starts on when its card shows", async () => {
    vi.mocked(api.fetchServerSettings).mockResolvedValue({
      ...NEW_SERVER_SETTINGS,
      mail: {
        enabled: true,
        host: "smtp.example.org",
        port: 587,
        from: "a@b.c",
      },
    });
    renderGate();
    await openQuickStart();
    expect(isShown(/^SMTP host/)).toBe(true);
  });
});
