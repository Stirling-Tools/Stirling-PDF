import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ChangeEvent, ReactNode } from "react";
import { ServerSelection } from "@editor/components/SetupWizard/ServerSelection";

const { testConnection, nativeFetch } = vi.hoisted(() => ({
  testConnection: vi.fn(),
  nativeFetch: vi.fn(),
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: { testConnection },
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: nativeFetch }));
vi.mock("@mantine/core", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Stack: Container,
    Alert: Container,
    Text: Container,
    TextInput: ({
      value,
      onChange,
      error,
    }: {
      value: string;
      onChange: (e: ChangeEvent<HTMLInputElement>) => void;
      error?: ReactNode;
    }) => (
      <div>
        <input value={value} onChange={onChange} />
        {error}
      </div>
    ),
  };
});
vi.mock("@editor/ui/Button", () => ({
  Button: ({
    children,
    type,
    onClick,
  }: {
    children: ReactNode;
    type?: "submit";
    onClick?: () => void;
  }) => (
    <button type={type ?? "button"} onClick={onClick}>
      {children}
    </button>
  ),
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));

beforeEach(() => {
  testConnection.mockReset();
  nativeFetch.mockReset();
  localStorage.clear();
});

it("fetches the login configuration through native HTTP, not the webview fetch", async () => {
  const webviewFetch = vi.spyOn(globalThis, "fetch");
  testConnection.mockResolvedValue({ success: true });
  nativeFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      loginMethod: "all",
      providerList: { "/oauth2/authorization/google": "Google" },
    }),
  });
  const onSelect = vi.fn();
  render(<ServerSelection onSelect={onSelect} loading={false} />);

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "https://pdf.example.com/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "common.continue" }));

  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith({
      url: "https://pdf.example.com",
      enabledOAuthProviders: [
        { id: "google", path: "/oauth2/authorization/google", label: "Google" },
      ],
      loginMethod: "all",
    }),
  );
  expect(nativeFetch).toHaveBeenCalledWith(
    "https://pdf.example.com/api/v1/proprietary/ui-data/login",
  );
  expect(webviewFetch).not.toHaveBeenCalled();
  webviewFetch.mockRestore();
});
