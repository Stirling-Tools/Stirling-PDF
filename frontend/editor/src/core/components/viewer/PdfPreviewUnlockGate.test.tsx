import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { PdfPreviewUnlockGate } from "@app/components/viewer/PdfPreviewUnlockGate";
import type EncryptedPdfUnlockModal from "@app/components/shared/EncryptedPdfUnlockModal";
import type { PdfPermissionSnapshot } from "@app/services/pdfPermissionProbe";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";

vi.mock("react-i18next", () => {
  const t = (key: string, fallback?: string) => fallback ?? key;
  return { useTranslation: () => ({ t }) };
});

const mock = vi.hoisted(() => ({
  trailer: vi.fn(),
  unlock: vi.fn(),
  probePermissions: vi.fn(),
}));
vi.mock("@app/utils/thumbnailUtils", () => ({
  looksEncryptedFromTrailer: mock.trailer,
}));
vi.mock("@app/services/pdfPermissionProbe", () => ({
  probePdfPermissions: mock.probePermissions,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: { unlockPreviewPdf: mock.unlock } }),
}));
vi.mock("@app/components/tools/ToolLoadingFallback", () => ({
  default: () => <span>Checking PDF</span>,
}));
vi.mock("@app/components/shared/EncryptedPdfUnlockModal", () => ({
  default: (props: ComponentProps<typeof EncryptedPdfUnlockModal>) =>
    props.opened ? (
      <div role="dialog">
        <span>{props.fileName}</span>
        <input
          aria-label="PDF password"
          value={props.password}
          onChange={(event) => props.onPasswordChange(event.target.value)}
        />
        {props.errorMessage && <span role="alert">{props.errorMessage}</span>}
        <button onClick={props.onUnlock}>Submit password</button>
        <button onClick={props.onSkip}>Dismiss</button>
      </div>
    ) : null,
}));
const access: PdfAccess = {
  password: "secret",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: 0,
  canModify: false,
  canAssemble: false,
  pageCount: 1,
};
const openableSnapshot: PdfPermissionSnapshot = {
  encrypted: true,
  requiresOpeningPassword: false,
  permissions: -4,
  ownerAuthenticated: true,
  pageCount: 1,
  signed: false,
};
const passwordSnapshot: PdfPermissionSnapshot = {
  encrypted: true,
  requiresOpeningPassword: true,
  permissions: 0,
  ownerAuthenticated: false,
  pageCount: 1,
  signed: false,
};
const passwordError = {
  isAxiosError: true,
  response: { status: 400, data: { type: "/errors/pdf-password" } },
};
const file = () => new File(["protected"], "preview.pdf", { lastModified: 1 });
function preview(pdf: File, close = vi.fn()) {
  return (
    <MantineProvider>
      <PdfPreviewUnlockGate file={pdf} onClose={close}>
        {(required) => <button onClick={required}>Rendered PDF</button>}
      </PdfPreviewUnlockGate>
    </MantineProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  clearPdfAccess();
  mock.trailer.mockResolvedValue(true);
  mock.unlock.mockRejectedValue(passwordError);
  mock.probePermissions.mockResolvedValue(openableSnapshot);
});
afterEach(() => {
  cleanup();
  clearPdfAccess();
});

it("keeps an ordinary preview out of the viewer until its trailer probe completes", async () => {
  let finish!: (protectedPdf: boolean) => void;
  mock.trailer.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  render(preview(file()));
  expect(screen.queryByText("Rendered PDF")).toBeNull();
  await act(async () => finish(false));
  expect(screen.getByText("Rendered PDF")).toBeVisible();
  expect(mock.unlock).not.toHaveBeenCalled();
});

it("prompts when the local probe finds an opening password, keeping a wrong password in the shared prompt", async () => {
  mock.probePermissions.mockResolvedValue(passwordSnapshot);
  const pdf = file();
  render(preview(pdf));
  await screen.findByRole("dialog");
  expect(screen.queryByText("Rendered PDF")).toBeNull();
  fireEvent.change(screen.getByLabelText("PDF password"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByText("Submit password"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Incorrect password",
  );
  mock.unlock.mockImplementation(async (bytes: File, password: string) =>
    rememberPdfAccess(bytes, { ...access, password }),
  );
  fireEvent.change(screen.getByLabelText("PDF password"), {
    target: { value: " secret " },
  });
  fireEvent.click(screen.getByText("Submit password"));
  await screen.findByText("Rendered PDF");
  expect(mock.unlock).toHaveBeenLastCalledWith(
    pdf,
    " secret ",
    expect.any(AbortSignal),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("reads owner-only protection locally and keeps its permissions without prompting", async () => {
  const pdf = file();
  render(preview(pdf));
  await screen.findByText("Rendered PDF");
  expect(mock.probePermissions).toHaveBeenCalledWith(pdf);
  expect(mock.unlock).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(getPdfAccess(pdf)).toMatchObject({
    encrypted: true,
    ownerAuthenticated: true,
    canModify: true,
  });
});

it("reuses exact-byte session access without probing or prompting", () => {
  const pdf = file();
  rememberPdfAccess(pdf, access);
  render(preview(pdf));
  expect(screen.getByText("Rendered PDF")).toBeVisible();
  expect(mock.trailer).not.toHaveBeenCalled();
  expect(mock.probePermissions).not.toHaveBeenCalled();
  expect(mock.unlock).not.toHaveBeenCalled();
});

it("offers the unlock prompt when the native viewer detects protection missed by the probe", async () => {
  mock.trailer.mockResolvedValue(false);
  render(preview(file()));
  fireEvent.click(await screen.findByText("Rendered PDF"));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});

it("closing the prompt closes the preview without rendering protected bytes", async () => {
  mock.probePermissions.mockResolvedValue(passwordSnapshot);
  const close = vi.fn();
  render(preview(file(), close));
  fireEvent.click(await screen.findByText("Dismiss"));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});

it("ignores a late result when another File has identical metadata", async () => {
  let finishFirst!: (snapshot: PdfPermissionSnapshot | null) => void;
  let finishSecond!: (snapshot: PdfPermissionSnapshot | null) => void;
  mock.probePermissions
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
  const view = render(preview(file()));
  await waitFor(() => expect(mock.probePermissions).toHaveBeenCalledTimes(2));
  mock.probePermissions.mockResolvedValue(passwordSnapshot);
  view.rerender(preview(file()));
  await screen.findByRole("dialog");
  await act(async () => {
    finishFirst(null);
    finishSecond(null);
  });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});

it("does not redisplay a rejected cached credential after dismissing its prompt", async () => {
  const pdf = file();
  rememberPdfAccess(pdf, access);
  render(preview(pdf));
  fireEvent.click(screen.getByText("Rendered PDF"));
  fireEvent.click(await screen.findByText("Dismiss"));
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});
