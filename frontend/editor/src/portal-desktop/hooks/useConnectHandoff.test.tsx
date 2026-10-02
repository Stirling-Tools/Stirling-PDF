import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

/** The in-app handshake: sign in, approve as that account, complete on the server, keep the session. */
const h = vi.hoisted(() => {
  class HttpError extends Error {
    constructor(readonly status: number) {
      super(`HTTP ${status}`);
    }
  }
  return {
    HttpError,
    owner: { value: true },
    startConnect: vi.fn(),
    startReauth: vi.fn(),
    completeConnect: vi.fn(),
    approveConnect: vi.fn(),
    withProvider: vi.fn(),
    withPassword: vi.fn(),
    setSession: vi.fn(),
    publish: vi.fn(),
    refresh: vi.fn(),
    restored: vi.fn(),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));
vi.mock("@app/portal/api/http", () => ({ HttpError: h.HttpError }));
vi.mock("@app/portal/api/link", () => ({
  startConnect: h.startConnect,
  startReauth: h.startReauth,
  completeConnect: h.completeConnect,
}));
vi.mock("@app/portal/api/connectApproval", () => ({
  approveConnect: h.approveConnect,
  requestIdOf: (url: string) => new URL(url).searchParams.get("request"),
}));
vi.mock("@app/services/cloudSignIn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/cloudSignIn")>()),
  signInToCloudWithProvider: h.withProvider,
  signInToCloudWithPassword: h.withPassword,
}));
vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: () => ({ auth: { setSession: h.setSession } }),
}));
vi.mock("@app/portal/auth/portalSaasSession", () => ({
  isTerminalSaasAuthError: () => false,
  portalSaasSessionRestored: h.restored,
}));
vi.mock("@app/portal/contexts/UIContext", () => ({
  useUI: () => ({ publishConnectOutcome: h.publish }),
}));
vi.mock("@app/portal/contexts/AccountLinkContext", () => ({
  useAccountLinkContext: () => ({ refresh: h.refresh }),
}));
vi.mock("@app/portal/hooks/useAccountLinkOwner", () => ({
  useAccountLinkOwner: () => h.owner.value,
}));
vi.mock("@app/portal/queryClient", () => ({
  getPortalQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@app/services/accountLinkBlock", () => ({
  clearAccountLinkBlock: vi.fn(),
}));
vi.mock("@app/services/connectionIdentity", () => ({
  connectionIdentityKey: () => "selfhosted|https://server.example|alice",
}));
vi.mock("@app/services/connectedServerBaseUrl", () => ({
  connectedServerBaseUrl: () => "https://server.example",
}));

import { useConnectHandoff } from "@app/portal/hooks/useConnectHandoff";
import { CloudSignInError } from "@app/services/cloudSignIn";

const PENDING = {
  phase: "PENDING",
  authorizeUrl: "https://app.example/link?request=req-1",
  secondsRemaining: 900,
  teamId: null,
};
const TOKENS = { accessToken: "cloud-access", refreshToken: "cloud-refresh" };

function Harness({ reauth = false }: { reauth?: boolean }) {
  const handoff = useConnectHandoff(reauth);
  return (
    <>
      <button onClick={handoff.begin}>Begin</button>
      <output data-testid="busy">{String(handoff.busy)}</output>
      {handoff.error && <p data-testid="error">{handoff.error}</p>}
      {handoff.body}
    </>
  );
}

function renderHarness(reauth = false) {
  return render(
    <MantineProvider>
      <Harness reauth={reauth} />
    </MantineProvider>,
  );
}

async function openSignIn(reauth = false) {
  const view = renderHarness(reauth);
  fireEvent.click(screen.getByRole("button", { name: "Begin" }));
  await screen.findByRole("button", { name: "Google" });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.owner.value = true;
  h.startConnect.mockResolvedValue(PENDING);
  h.startReauth.mockResolvedValue(PENDING);
  h.withProvider.mockResolvedValue(TOKENS);
  h.approveConnect.mockResolvedValue({
    callbackUrl: "https://server.example/account-link/callback",
    nonce: "nonce-1",
  });
  h.completeConnect.mockResolvedValue({ phase: "LINKED" });
  h.setSession.mockResolvedValue({ error: null });
  h.refresh.mockResolvedValue(undefined);
});

describe("desktop connect handoff", () => {
  it("approves as the account it signed in to, completes on the server and keeps that session", async () => {
    await openSignIn();
    // Named after the server and with no callback: nothing in a webview can receive one.
    expect(h.startConnect).toHaveBeenCalledWith("https://server.example");

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    await waitFor(() =>
      expect(h.publish).toHaveBeenLastCalledWith({
        mode: "link",
        state: "linked",
        sessionRestored: true,
      }),
    );
    expect(h.withProvider).toHaveBeenCalledWith(
      "google",
      expect.any(String),
      expect.any(String),
    );
    expect(h.approveConnect).toHaveBeenCalledWith("req-1", "cloud-access");
    expect(h.completeConnect).toHaveBeenCalledWith("nonce-1");
    expect(h.setSession).toHaveBeenCalledWith({
      access_token: "cloud-access",
      refresh_token: "cloud-refresh",
    });
    expect(h.restored).toHaveBeenCalledOnce();
    expect(screen.getByTestId("busy")).toHaveTextContent("false");
  });

  it("keeps the sign-in open when a renewal picks an account outside the linked team", async () => {
    h.approveConnect.mockRejectedValueOnce(new h.HttpError(409));
    await openSignIn(true);
    expect(h.startReauth).toHaveBeenCalledWith();

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    expect(
      await screen.findByText(/Sign in as the current owner of the linked/),
    ).toBeInTheDocument();
    expect(h.completeConnect).not.toHaveBeenCalled();
    expect(h.setSession).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();

    // The right account finishes the same request.
    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    await waitFor(() =>
      expect(h.publish).toHaveBeenLastCalledWith({
        mode: "reauth",
        state: "linked",
        sessionRestored: true,
      }),
    );
    expect(h.startReauth).toHaveBeenCalledOnce();
  });

  it("goes back with the reason when the request expired before approval", async () => {
    h.approveConnect.mockRejectedValueOnce(new h.HttpError(404));
    await openSignIn();

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    expect(await screen.findByTestId("error")).toHaveTextContent(
      "Connection requests are short lived. Start another one.",
    );
    expect(screen.getByTestId("busy")).toHaveTextContent("false");
    expect(h.completeConnect).not.toHaveBeenCalled();
  });

  it("says the password was wrong without leaving the sign-in", async () => {
    h.withPassword.mockRejectedValueOnce(new CloudSignInError("credentials"));
    await openSignIn();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: " admin@acme.example " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Incorrect email or password."),
    ).toBeInTheDocument();
    expect(h.withPassword).toHaveBeenCalledWith("admin@acme.example", "wrong");
    expect(h.approveConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Google" })).toBeEnabled();
  });

  it("retries an unconfirmed completion without approving again", async () => {
    h.completeConnect.mockResolvedValueOnce({ phase: "PENDING" });
    await openSignIn();

    fireEvent.click(screen.getByRole("button", { name: "Google" }));

    await waitFor(() =>
      expect(h.publish).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: "retry" }),
      ),
    );
    const { reclaim } = h.publish.mock.lastCall![0] as { reclaim: () => void };
    await act(async () => reclaim());

    await waitFor(() =>
      expect(h.publish).toHaveBeenLastCalledWith({
        mode: "link",
        state: "linked",
        sessionRestored: true,
      }),
    );
    expect(h.approveConnect).toHaveBeenCalledOnce();
    expect(h.completeConnect).toHaveBeenCalledTimes(2);
  });

  it("stops once the dialog closes, even when the browser finishes later", async () => {
    let finishSignIn: (tokens: typeof TOKENS) => void = () => {};
    h.withProvider.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSignIn = resolve;
      }),
    );
    const view = await openSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Google" }));
    expect(
      screen.getByText(/Finish signing in in your browser/),
    ).toBeInTheDocument();

    view.unmount();
    await act(async () => finishSignIn(TOKENS));

    expect(h.approveConnect).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("refuses to start for anyone but the org owner", () => {
    h.owner.value = false;
    renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "Begin" }));

    expect(screen.getByTestId("error")).toHaveTextContent(
      "Only the org owner can link or unlink this server.",
    );
    expect(h.startConnect).not.toHaveBeenCalled();
  });
});
