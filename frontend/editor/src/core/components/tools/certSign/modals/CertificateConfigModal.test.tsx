import { act, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CertificateConfigModal } from "@app/components/tools/certSign/modals/CertificateConfigModal";

const { post, t } = vi.hoisted(() => ({
  post: vi.fn(),
  t: (key: string, fallback?: string) => fallback ?? key,
}));
vi.mock("@app/services/apiClient", () => ({ default: { post } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("@app/components/tools/certSign/CertificateSelector", () => ({
  CertificateSelector: (props: {
    onCertTypeChange: (value: string) => void;
    onP12FileChange: (file: File) => void;
    onPasswordChange: (value: string) => void;
    onUploadFormatChange: (value: string) => void;
    onPrivateKeyFileChange: (file: File) => void;
    onCertFileChange: (file: File) => void;
  }) => (
    <>
      <button
        onClick={() => {
          props.onCertTypeChange("UPLOAD");
          props.onP12FileChange(new File(["certificate"], "test.p12"));
        }}
      >
        Upload test certificate
      </button>
      <button
        onClick={() => {
          props.onCertTypeChange("UPLOAD");
          props.onUploadFormatChange("PEM");
          props.onPrivateKeyFileChange(new File(["key"], "key.pem"));
          props.onCertFileChange(new File(["cert"], "cert.pem"));
        }}
      >
        Use PEM
      </button>
      <input
        aria-label="Password"
        onChange={(event) => props.onPasswordChange(event.target.value)}
      />
    </>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(650);
  });
function setup() {
  const onSign = vi.fn().mockResolvedValue(undefined);
  render(
    <MantineProvider>
      <CertificateConfigModal
        opened
        onClose={vi.fn()}
        onSign={onSign}
        signatureCount={0}
      />
    </MantineProvider>,
  );
  return onSign;
}

it("blocks invalid certificates, then permits certificate-only signing after correction", async () => {
  const onSign = setup();
  post.mockResolvedValueOnce({
    data: { valid: false, error: "Incorrect password" },
  });
  fireEvent.click(screen.getByText("Upload test certificate"));
  expect(screen.getByRole("button", { name: "Sign Document" })).toBeDisabled();
  await tick();
  expect(screen.getByRole("button", { name: "Sign Document" })).toBeDisabled();
  post.mockResolvedValueOnce({
    data: { valid: true, subjectName: "Alice", notAfter: null },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "correct" },
  });
  await tick();
  expect(screen.getByRole("button", { name: "Sign Document" })).toBeEnabled();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign Document" }));
  });
  expect(onSign).toHaveBeenCalledWith(
    expect.objectContaining({ password: "correct" }),
    "",
    "",
  );
});

it("ignores an older valid response after the password has changed", async () => {
  setup();
  let resolveOld: (value: unknown) => void = () => {};
  post.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  fireEvent.click(screen.getByText("Upload test certificate"));
  await tick();
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong" },
  });
  post.mockResolvedValueOnce({
    data: { valid: false, error: "Incorrect password" },
  });
  await tick();
  await act(async () => {
    resolveOld({ data: { valid: true, subjectName: "Alice" } });
  });
  expect(screen.getByRole("button", { name: "Sign Document" })).toBeDisabled();
});

it("prevalidates both PEM files before enabling submission", async () => {
  setup();
  post.mockResolvedValueOnce({ data: { valid: true } });
  fireEvent.click(screen.getByText("Use PEM"));
  await tick();
  const payload = post.mock.calls[0][1] as FormData;
  expect(payload.get("certType")).toBe("PEM");
  expect(payload.get("privateKeyFile")).toBeInstanceOf(File);
  expect(payload.get("certFile")).toBeInstanceOf(File);
  expect(screen.getByRole("button", { name: "Sign Document" })).toBeEnabled();
});
