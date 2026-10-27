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
import { PdfPreviewUnlockGate } from "@editor/components/viewer/PdfPreviewUnlockGate";
import type EncryptedPdfUnlockModal from "@editor/components/shared/EncryptedPdfUnlockModal";
import {
  clearPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";

vi.mock("react-i18next", () => {
  const t = (key: string, fallback?: string) => fallback ?? key;
  return { useTranslation: () => ({ t }) };
});

const mock = vi.hoisted(() => ({ probe: vi.fn(), unlock: vi.fn() }));
vi.mock("@editor/utils/pdfEncryptionProbe", () => ({
  looksEncryptedFromTrailer: mock.probe,
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: { unlockPreviewPdf: mock.unlock } }),
}));
vi.mock("@editor/components/tools/ToolLoadingFallback", () => ({
  default: () => <span>Checking PDF</span>,
}));
vi.mock("@editor/components/shared/EncryptedPdfUnlockModal", () => ({
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
  pageCount: 1,
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
  mock.probe.mockResolvedValue(true);
  mock.unlock.mockRejectedValue(passwordError);
});
afterEach(() => {
  cleanup();
  clearPdfAccess();
});

it("keeps an ordinary preview out of the viewer until its probe completes", async () => {
  let finish!: (protectedPdf: boolean) => void;
  mock.probe.mockReturnValue(
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

it("unlocks a plain File preview, keeping a wrong password in the shared prompt", async () => {
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

it("inspects owner-only protection without prompting and keeps its permissions", async () => {
  const pdf = file();
  mock.unlock.mockImplementation(async (bytes: File, password: string) =>
    rememberPdfAccess(bytes, { ...access, password }),
  );
  render(preview(pdf));
  await screen.findByText("Rendered PDF");
  expect(mock.unlock).toHaveBeenCalledExactlyOnceWith(
    pdf,
    "",
    expect.any(AbortSignal),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("reuses exact-byte session access without probing or prompting", () => {
  const pdf = file();
  rememberPdfAccess(pdf, access);
  render(preview(pdf));
  expect(screen.getByText("Rendered PDF")).toBeVisible();
  expect(mock.probe).not.toHaveBeenCalled();
  expect(mock.unlock).not.toHaveBeenCalled();
});

it("offers the unlock prompt when the native viewer detects protection missed by the probe", async () => {
  mock.probe.mockResolvedValue(false);
  render(preview(file()));
  fireEvent.click(await screen.findByText("Rendered PDF"));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});

it("closing the prompt closes the preview without rendering protected bytes", async () => {
  const close = vi.fn();
  render(preview(file(), close));
  fireEvent.click(await screen.findByText("Dismiss"));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});

it("ignores a late failure when another File has identical metadata", async () => {
  let reject!: (error: unknown) => void;
  mock.unlock.mockReturnValueOnce(
    new Promise<void>((_, fail) => {
      reject = fail;
    }),
  );
  const view = render(preview(file()));
  await waitFor(() => expect(mock.unlock).toHaveBeenCalledOnce());
  const oldSignal = mock.unlock.mock.calls[0][2] as AbortSignal;
  mock.probe.mockResolvedValue(false);
  view.rerender(preview(file()));
  await screen.findByText("Rendered PDF");
  expect(oldSignal.aborted).toBe(true);
  await act(async () => reject(passwordError));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Rendered PDF")).toBeVisible();
});

it("does not redisplay a rejected cached credential after dismissing its prompt", async () => {
  const pdf = file();
  rememberPdfAccess(pdf, access);
  render(preview(pdf));
  fireEvent.click(screen.getByText("Rendered PDF"));
  fireEvent.click(await screen.findByText("Dismiss"));
  expect(screen.queryByText("Rendered PDF")).toBeNull();
});
