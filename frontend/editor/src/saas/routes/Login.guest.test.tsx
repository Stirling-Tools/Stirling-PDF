import type { ReactNode, ButtonHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Login from "@app/routes/Login";

const auth = vi.hoisted(() => ({
  session: { user: { is_anonymous: true } } as {
    user: { is_anonymous: boolean };
  } | null,
  loading: false,
  refreshSession: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
  anonymousSignIn: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => auth.navigate }));
vi.mock("@app/auth/UseSession", () => ({ useAuth: () => auth }));
vi.mock("@app/auth/supabase", () => ({
  supabase: { auth: {} },
  signInAnonymously: auth.anonymousSignIn,
}));
vi.mock("@app/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@app/hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
vi.mock("@app/utils/loginLanding", () => ({
  resolveLandingPath: vi.fn().mockResolvedValue("/editor"),
}));
vi.mock("@app/routes/authShared/AuthLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@app/ui/Button", () => ({
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
vi.mock("@app/ui/Icon", () => ({ Icon: () => null }));
vi.mock("@app/auth/ui/ErrorMessage", () => ({ default: () => null }));
vi.mock("@app/routes/login/OAuthButtons", () => ({ default: () => null }));
vi.mock("@app/routes/login/EmailPasswordForm", () => ({
  default: () => <form aria-label="Account sign-in" />,
}));
vi.mock("@app/routes/login/LoggedInState", () => ({
  default: () => <div>Account landing</div>,
}));
vi.mock("@app/components/shared/LoadingFallback", () => ({
  LoadingFallback: () => <div>Checking session</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/login");
  auth.session = { user: { is_anonymous: true } };
  auth.loading = false;
  auth.anonymousSignIn.mockResolvedValue({ data: { user: { id: "guest" } } });
});

describe("Guest account sign-in", () => {
  it.each(["", "?next=%2Feditor"])(
    "keeps the sign-in form reachable for an existing guest%s",
    (query) => {
      window.history.replaceState({}, "", `/login${query}`);
      render(<Login />);
      expect(
        screen.getByRole("form", { name: "Account sign-in" }),
      ).toBeInTheDocument();
      expect(auth.navigate).not.toHaveBeenCalled();
    },
  );

  it("returns to the requested page once the guest signs in to an account", async () => {
    window.history.replaceState({}, "", "/login?next=%2Feditor");
    const view = render(<Login />);
    auth.session = { user: { is_anonymous: false } };
    view.rerender(<Login />);
    await waitFor(() =>
      expect(auth.navigate).toHaveBeenCalledWith("/editor", { replace: true }),
    );
  });

  it("retains the landing redirect for an existing account", () => {
    auth.session = { user: { is_anonymous: false } };
    render(<Login />);
    expect(screen.getByText("Account landing")).toBeInTheDocument();
  });

  it("reuses the existing guest when Skip is selected", async () => {
    render(<Login />);
    fireEvent.click(screen.getByRole("button", { name: /signup.skip/ }));
    await waitFor(() =>
      expect(auth.navigate).toHaveBeenCalledWith("/editor", { replace: true }),
    );
    expect(auth.anonymousSignIn).not.toHaveBeenCalled();
  });

  it.each(["", "?next=%2Fprocessor"])(
    "still enters the app when Skip is explicitly selected%s",
    async (query) => {
      auth.session = null;
      window.history.replaceState({}, "", `/login${query}`);
      render(<Login />);
      fireEvent.click(screen.getByRole("button", { name: /signup.skip/ }));
      await waitFor(() =>
        expect(auth.navigate).toHaveBeenCalledWith(
          query ? "/processor" : "/editor",
          { replace: true },
        ),
      );
      expect(auth.refreshSession).toHaveBeenCalledOnce();
    },
  );
});
