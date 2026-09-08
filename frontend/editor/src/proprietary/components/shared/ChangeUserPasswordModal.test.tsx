import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import ChangeUserPasswordModal from "@app/components/shared/ChangeUserPasswordModal";
import { userManagementService } from "@app/services/userManagementService";

vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
import { alert } from "@app/components/toast";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@app/services/userManagementService", () => ({
  userManagementService: { changeUserPassword: vi.fn() },
}));

const USER = {
  id: 1,
  username: "bob@example.com",
  enabled: true,
  roleName: "ROLE_USER",
  rolesAsString: "ROLE_USER",
  authenticationType: "password",
};

const renderModal = () =>
  render(
    <MantineProvider>
      <ChangeUserPasswordModal
        opened
        onClose={vi.fn()}
        user={USER}
        onSuccess={vi.fn()}
        mailEnabled={false}
      />
    </MantineProvider>,
  );

describe("ChangeUserPasswordModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a password below the policy minimum before calling the server", async () => {
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(
      screen.getByPlaceholderText("Enter a new password"),
      "secret1",
    );
    await user.type(
      screen.getByPlaceholderText("Re-enter the new password"),
      "secret1",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith({
        alertType: "error",
        title: "Password must be at least 8 characters",
      });
    });
    expect(userManagementService.changeUserPassword).not.toHaveBeenCalled();
  });

  it("submits a password that meets the policy", async () => {
    vi.mocked(userManagementService.changeUserPassword).mockResolvedValue(
      undefined as never,
    );
    const user = userEvent.setup({ delay: null });
    renderModal();

    await user.type(
      screen.getByPlaceholderText("Enter a new password"),
      "secret12",
    );
    await user.type(
      screen.getByPlaceholderText("Re-enter the new password"),
      "secret12",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(userManagementService.changeUserPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "bob@example.com",
          newPassword: "secret12",
        }),
      );
    });
  });
});
