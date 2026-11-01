import { MantineProvider } from "@mantine/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectLocalPdfAccess,
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";

import { PermissionsPasswordButton } from "@editor/tools/pdfTextEditor/components/PermissionsPasswordButton";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
const inspect = vi.mocked(inspectLocalPdfAccess);
const reader: PdfAccess = {
  encrypted: true,
  password: "reader-password",
  openingAuthenticated: true,
  ownerAuthenticated: false,
  signed: false,
  permissions: 0,
  pageCount: 1,
  honorOwnerPasswords: true,
};

beforeEach(() => {
  inspect.mockReset();
});
afterEach(() => {
  cleanup();
  clearPdfAccess();
});

function setup(access = reader) {
  const file = new File(["pdf"], "restricted.pdf", { type: "application/pdf" });
  rememberPdfAccess(file, access);
  const onVerified = vi.fn();
  render(
    <MantineProvider env="test">
      <PermissionsPasswordButton file={file} onVerified={onVerified} />
    </MantineProvider>,
  );
  return { file, onVerified };
}

describe("editor permissions verification", () => {
  it("keeps a cancelled document restricted and allows retrying", () => {
    const { file, onVerified } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Enter permissions password" }),
    );
    expect(
      screen.getByLabelText("Permissions password", { exact: true }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Password to open", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Permissions password", { exact: true }),
      { target: { value: "discard-this" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onVerified).not.toHaveBeenCalled();
    expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Enter permissions password" }),
    );
    expect(
      screen.getByLabelText("Permissions password", { exact: true }),
    ).toHaveValue("");
  });

  it("rejects an opening credential and resumes only after owner verification", async () => {
    const { file, onVerified } = setup();
    inspect.mockResolvedValueOnce(reader);
    fireEvent.click(
      screen.getByRole("button", { name: "Enter permissions password" }),
    );
    fireEvent.change(
      screen.getByLabelText("Permissions password", { exact: true }),
      { target: { value: "reader-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText(
        "Enter the permissions password to allow restricted actions.",
      ),
    ).toBeVisible();
    expect(onVerified).not.toHaveBeenCalled();
    expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);

    inspect.mockResolvedValueOnce({
      ...reader,
      password: "owner-password",
      openingAuthenticated: false,
      ownerAuthenticated: true,
    });
    fireEvent.change(
      screen.getByLabelText("Permissions password", { exact: true }),
      { target: { value: "owner-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(file));
    expect(getPdfAccess(file)).toMatchObject({
      password: "owner-password",
      openingPassword: "reader-password",
      ownerAuthenticated: true,
    });
  });

  it("discards a verification response after the action unmounts", async () => {
    const { file, onVerified } = setup();
    let complete!: (response: PdfAccess) => void;
    inspect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Enter permissions password" }),
    );
    fireEvent.change(
      screen.getByLabelText("Permissions password", { exact: true }),
      { target: { value: "owner-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    cleanup();
    await act(async () => complete({ ...reader, ownerAuthenticated: true }));
    expect(onVerified).not.toHaveBeenCalled();
    expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);
  });

  it.each([
    { signed: true },
    { encrypted: false },
    { permissions: -4 },
    { ownerAuthenticated: true },
    { honorOwnerPasswords: false },
  ])("does not request owner verification for %j", (access) => {
    setup({ ...reader, ...access });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
