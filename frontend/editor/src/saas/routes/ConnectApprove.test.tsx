import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import ConnectApprove from "@app/routes/ConnectApprove";
import { ResumePendingConnect } from "@app/routes/ResumePendingConnect";
import { readPendingConnect } from "@app/routes/pendingConnect";
import type { PendingConnect } from "@app/routes/ConnectApproveView";
import apiClient from "@app/services/apiClient";

const { signOut, session, replace } = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  session: {
    user: { id: "member-1" },
    access_token: "test-access",
    refresh_token: "test-refresh",
  },
}));

vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({
    session,
    user: { email: "member@example.com" },
    loading: false,
    signOut,
  }),
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));

vi.mock("@app/routes/authShared/AuthLayout", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@app/ui", async () => ({
  ...(await import("@app/ui/Banner")),
  ...(await import("@app/ui/Button")),
  ...(await import("@app/ui/Checkbox")),
  ...(await import("@app/ui/Spinner")),
}));

const pending: PendingConnect & { status: "PENDING" } = {
  requestId: "req-1",
  callbackOrigin: "https://pdf.example.com",
  insecureTransport: false,
  mode: "LINK",
  status: "PENDING",
  canApprove: false,
  canDeny: false,
};

function TestApp() {
  return (
    <MantineProvider>
      <MemoryRouter initialEntries={["/link?request=req-1"]}>
        <ResumePendingConnect />
        <Routes>
          <Route path="/link" element={<ConnectApprove />} />
          <Route path="/" element={<p>App home</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>
  );
}

function arrive() {
  return render(<TestApp />);
}

beforeEach(() => {
  vi.clearAllMocks();
  session.user.id = "member-1";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost",
      href: "http://localhost/link?request=req-1",
      search: "?request=req-1",
      replace,
    },
  });
  localStorage.clear();
  vi.mocked(apiClient.get).mockResolvedValue({ data: pending });
});

describe("connect approval permissions", () => {
  it("lets members dismiss the remembered prompt without declining the request", async () => {
    arrive();
    const dismiss = await screen.findByRole("button", {
      name: "connect.confirm.dismiss",
    });
    expect(
      screen.queryByRole("button", { name: "connect.confirm.deny" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.approve" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(readPendingConnect()).toBe("req-1");

    fireEvent.click(dismiss);

    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(readPendingConnect()).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("preserves the request when a member switches accounts", async () => {
    arrive();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "connect.confirm.switchAccount",
      }),
    );

    expect(signOut).toHaveBeenCalledOnce();
    expect(readPendingConnect()).toBe("req-1");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("keeps decisions hidden until the lookup supplies permissions", async () => {
    let resolveLookup!: (value: { data: typeof pending }) => void;
    vi.mocked(apiClient.get).mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    arrive();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.approve" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.deny" }),
    ).toBeNull();

    await act(async () => resolveLookup({ data: pending }));

    expect(
      await screen.findByRole("button", { name: "connect.confirm.dismiss" }),
    ).toBeInTheDocument();
  });

  it("keeps leader decisions and acknowledgement without offering dismissal", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pending, canApprove: true, canDeny: true },
    });
    vi.mocked(apiClient.post).mockResolvedValue({});
    arrive();
    const approve = await screen.findByRole("button", {
      name: "connect.confirm.approve",
    });
    expect(approve).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.dismiss" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(approve).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "connect.confirm.deny" }),
    );

    await waitFor(() => expect(readPendingConnect()).toBeNull());
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/account-link/connect/req-1/deny",
    );
  });

  it("renews the linked owner with one explicit click and no checkbox", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pending, mode: "REAUTH", canApprove: true, canDeny: true },
    });
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        callbackUrl: "https://pdf.example.com/account-link/callback",
        nonce: "test-nonce",
      },
    });
    arrive();
    const renew = await screen.findByRole("button", {
      name: "connect.renewal.approve",
    });
    expect(renew).toBeEnabled();
    expect(screen.getByText("connect.renewal.title")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.approve" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.deny" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "connect.confirm.dismiss" }),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
    fireEvent.click(renew);
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(apiClient.post).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/account-link/connect/req-1/approve",
    );
    const destination = new URL(replace.mock.calls[0][0]);
    expect(destination.origin).toBe("https://pdf.example.com");
    const fragment = new URLSearchParams(destination.hash.slice(1));
    expect(fragment.get("nonce")).toBe("test-nonce");
    expect(fragment.get("access_token")).toBe(session.access_token);
    expect(fragment.get("refresh_token")).toBe(session.refresh_token);
    expect(readPendingConnect()).toBeNull();
  });

  it.each(["dismiss", "switchAccount"])(
    "offers a wrong account only switching or dismissal: %s",
    async (action) => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { ...pending, mode: "REAUTH" },
      });
      arrive();
      expect(
        await screen.findByText("connect.renewal.wrongAccount"),
      ).toBeInTheDocument();
      expect(screen.getByText("member@example.com")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(2);
      fireEvent.click(
        screen.getByRole("button", { name: `connect.confirm.${action}` }),
      );
      if (action === "dismiss") {
        expect(await screen.findByText("App home")).toBeInTheDocument();
        expect(readPendingConnect()).toBeNull();
        expect(signOut).not.toHaveBeenCalled();
      } else {
        expect(signOut).toHaveBeenCalledOnce();
        expect(readPendingConnect()).toBe("req-1");
      }
      expect(apiClient.post).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it("lets the linked owner dismiss renewal without touching the request", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pending, mode: "REAUTH", canApprove: true, canDeny: true },
    });
    arrive();
    fireEvent.click(
      await screen.findByRole("button", { name: "connect.confirm.dismiss" }),
    );
    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it.each([403, 409])(
    "removes renewal permission when the API rejects a stale decision (%s)",
    async (status) => {
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { ...pending, mode: "REAUTH", canApprove: true },
      });
      vi.mocked(apiClient.post).mockRejectedValue({
        isAxiosError: true,
        response: { status },
      });
      arrive();
      fireEvent.click(
        await screen.findByRole("button", { name: "connect.renewal.approve" }),
      );
      expect(
        await screen.findByText("connect.renewal.wrongAccount"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "connect.renewal.approve" }),
      ).toBeNull();
      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(replace).not.toHaveBeenCalled();
      expect(readPendingConnect()).toBe("req-1");
    },
  );

  it("leaves a recoverable renewal error after a network failure", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pending, mode: "REAUTH", canApprove: true },
    });
    vi.mocked(apiClient.post).mockRejectedValue(new Error("offline"));
    arrive();
    fireEvent.click(
      await screen.findByRole("button", { name: "connect.renewal.approve" }),
    );
    expect(
      await screen.findByText("connect.renewal.failed"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect.renewal.approve" }),
    ).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("checks permissions again when the account changes and ignores the previous lookup", async () => {
    let resolveOld!: (value: { data: typeof pending }) => void;
    vi.mocked(apiClient.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    const view = arrive();
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { ...pending, mode: "REAUTH", canApprove: false },
    });
    session.user.id = "different-owner";
    view.rerender(<TestApp />);
    expect(
      await screen.findByText("connect.renewal.wrongAccount"),
    ).toBeInTheDocument();
    await act(async () =>
      resolveOld({ data: { ...pending, mode: "REAUTH", canApprove: true } }),
    );
    expect(
      screen.queryByRole("button", { name: "connect.renewal.approve" }),
    ).toBeNull();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it("removes the old account's actions while checking the newly signed-in account", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { ...pending, mode: "REAUTH", canApprove: true },
    });
    const view = arrive();
    await screen.findByRole("button", { name: "connect.renewal.approve" });
    vi.mocked(apiClient.get).mockReturnValueOnce(new Promise(() => {}));
    session.user.id = "another-account";
    view.rerender(<TestApp />);
    expect(
      screen.queryByRole("button", { name: "connect.renewal.approve" }),
    ).toBeNull();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
