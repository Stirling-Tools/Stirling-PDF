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

const { signOut, session } = vi.hoisted(() => ({
  signOut: vi.fn(),
  session: { user: { id: "member-1" } },
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

function arrive() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/link?request=req-1"]}>
        <ResumePendingConnect />
        <Routes>
          <Route path="/link" element={<ConnectApprove />} />
          <Route path="/" element={<p>App home</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it("allows a member to reauthenticate without offering decline", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...pending, mode: "REAUTH", canApprove: true },
    });
    arrive();
    expect(
      await screen.findByRole("button", { name: "connect.confirm.approve" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "connect.confirm.dismiss" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "connect.confirm.deny" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "connect.confirm.approve" }),
    ).toBeEnabled();
  });
});
