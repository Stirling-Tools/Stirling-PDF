import type { ButtonHTMLAttributes, ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  isAnonymous: false,
  navigate: vi.fn(),
  refresh: vi.fn(),
  anonymousSignIn: vi.fn(),
  landing: vi.fn(),
  takeDestination: vi.fn(),
}));

vi.mock("@editor/auth/UseSession", () => ({
  useAuth: () => ({
    session: state.session,
    isAnonymous: state.isAnonymous,
    loading: false,
    refreshSession: state.refresh,
  }),
}));
vi.mock("@editor/auth/supabase", () => ({
  supabase: { auth: {} },
  signInAnonymously: state.anonymousSignIn,
}));
vi.mock("@editor/utils/loginLanding", () => ({
  resolveLandingPath: state.landing,
}));
vi.mock("@editor/services/pendingDestination", () => ({
  rememberPendingDestination: vi.fn(),
  takePendingDestination: state.takeDestination,
}));
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useNavigate: () => state.navigate,
}));
vi.mock("@editor/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));
vi.mock("@editor/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => {} }));
vi.mock("@editor/routes/authShared/AuthLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@editor/ui/Button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@editor/components/shared/PrivateContent", () => ({
  PrivateContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@editor/routes/login/OAuthButtons", () => ({ default: () => null }));
vi.mock("@editor/routes/login/EmailPasswordForm", () => ({
  default: () => <div data-testid="credential-form">Sign in</div>,
}));
vi.mock("@editor/routes/login/LoggedInState", () => ({
  default: () => <div>Signed in</div>,
}));
vi.mock("@editor/auth/ui/ErrorMessage", () => ({
  default: ({ error }: { error: string | null }) =>
    error ? <div role="alert">{error}</div> : null,
}));

const Login = (await import("@editor/routes/Login")).default;
const originalUrl = window.location.href;

beforeEach(() => {
  vi.clearAllMocks();
  state.session = null;
  state.isAnonymous = false;
  state.refresh.mockResolvedValue(undefined);
  state.anonymousSignIn.mockResolvedValue({ data: { user: { id: "guest" } } });
  state.landing.mockResolvedValue("/editor");
  state.takeDestination.mockReturnValue(null);
  window.history.replaceState({}, "", "/login");
});

afterEach(() => {
  window.history.replaceState({}, "", originalUrl);
});

describe("SaaS guest sign-in", () => {
  it("navigates to the normal landing page after creating a guest session", async () => {
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: /^Skip/ }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith("/editor", { replace: true }),
    );
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("uses an explicit safe return path and consumes a remembered destination", async () => {
    window.history.replaceState(
      {},
      "",
      "/login?from=%2Feditor%3Ftool%3Dcompress",
    );
    state.takeDestination.mockReturnValue("/workspace");
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: /^Skip/ }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith("/editor?tool=compress", {
        replace: true,
      }),
    );
    expect(state.takeDestination).toHaveBeenCalledOnce();
    expect(state.landing).not.toHaveBeenCalled();
  });

  it("uses a remembered destination when there is no explicit return path", async () => {
    state.takeDestination.mockReturnValue("/workspace");
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: /^Skip/ }));
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith("/workspace", {
        replace: true,
      }),
    );
    expect(state.landing).not.toHaveBeenCalled();
  });

  it("keeps an existing guest on a requested account sign-in form", () => {
    state.session = { user: { id: "guest" } };
    state.isAnonymous = true;
    window.history.replaceState({}, "", "/login?from=%2Foauth%2Fconsent");
    render(<Login />);
    expect(screen.getByTestId("credential-form")).toBeInTheDocument();
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("waits for session refresh before navigating", async () => {
    let finishRefresh: () => void = () => {};
    state.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: /^Skip/ }));
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(state.navigate).not.toHaveBeenCalled();
    await act(async () => {
      finishRefresh();
    });
    await waitFor(() =>
      expect(state.navigate).toHaveBeenCalledWith("/editor", { replace: true }),
    );
  });
});
