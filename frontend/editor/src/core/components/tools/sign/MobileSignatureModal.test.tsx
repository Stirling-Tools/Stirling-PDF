/**
 * Receive-flow contract for the phone-signature QR modal.
 *
 * The transfer session's upload endpoint accepts any file from anyone holding
 * the QR URL, so the modal must treat arrivals as untrusted. Images become
 * draw/photo payloads by filename prefix, a signature-text JSON payload is
 * parsed and clamped field by field, and anything else is ignored.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import MobileSignatureModal, {
  type MobileSignaturePayload,
} from "@app/components/tools/sign/MobileSignatureModal";
import apiClient from "@app/services/apiClient";
import { expectConsole } from "@app/tests/failOnConsole";

// Render the English fallbacks (the test i18n instance has no loaded locale).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@app/services/apiClient", () => ({
  default: {
    defaults: { baseURL: "http://localhost:8080" },
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { enableMobileSignature: true } }),
}));

const mockedApi = vi.mocked(apiClient, true);

const SESSION_INFO = {
  sessionId: "s",
  createdAt: Date.now(),
  expiresAt: Date.now() + 600_000,
  timeoutMs: 600_000,
};

function primeSession(
  files: Array<{ filename: string; contentType: string; body?: string }>,
) {
  mockedApi.post.mockResolvedValue({
    status: 200,
    data: SESSION_INFO,
  } as never);
  mockedApi.delete.mockResolvedValue({ status: 200 } as never);
  mockedApi.get.mockImplementation(((url: string, config?: unknown) => {
    if (url.includes("/files/")) {
      return Promise.resolve({ status: 200, data: { files } } as never);
    }
    if (url.includes("/download/")) {
      const filename = url.split("/").pop() ?? "";
      const meta = files.find((f) => f.filename === filename);
      return Promise.resolve({
        status: 200,
        data: new Blob([meta?.body ?? "fake-bytes"], {
          type: meta?.contentType,
        }),
        config,
      } as never);
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  }) as never);
}

function renderModal(
  onSignatureReceived: (payload: MobileSignaturePayload) => void,
  onClose: () => void,
) {
  return render(
    <MantineProvider>
      <MobileSignatureModal
        opened
        onClose={onClose}
        onSignatureReceived={onSignatureReceived}
      />
    </MantineProvider>,
  );
}

describe("MobileSignatureModal", () => {
  // clearAllMocks (not restoreAllMocks): the hook's unmount cleanup still
  // calls apiClient.delete during test teardown, so implementations must
  // survive until React Testing Library's auto-cleanup has unmounted.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hands a drawn signature to the caller as a draw payload and closes", async () => {
    primeSession([
      { filename: "signature-draw-1.png", contentType: "image/png" },
    ]);
    const onSignatureReceived = vi.fn();
    const onClose = vi.fn();

    renderModal(onSignatureReceived, onClose);

    await waitFor(() => expect(onSignatureReceived).toHaveBeenCalledTimes(1));
    const payload = onSignatureReceived.mock.calls[0][0];
    expect(payload.kind).toBe("draw");
    expect(payload.dataUrl).toMatch(/^data:image\/png/);
    expect(onClose).toHaveBeenCalled();
  });

  it("routes a photographed signature as a photo payload", async () => {
    primeSession([
      { filename: "signature-photo-1.jpg", contentType: "image/jpeg" },
    ]);
    const onSignatureReceived = vi.fn();

    renderModal(onSignatureReceived, vi.fn());

    await waitFor(() => expect(onSignatureReceived).toHaveBeenCalledTimes(1));
    expect(onSignatureReceived.mock.calls[0][0].kind).toBe("photo");
  });

  it("parses a typed signature as text, clamping unknown font and colour", async () => {
    primeSession([
      {
        filename: "signature-text-1.json",
        contentType: "application/json",
        body: JSON.stringify({
          text: "  Reece  ",
          fontFamily: "Wingdings",
          color: "javascript:alert(1)",
        }),
      },
    ]);
    const onSignatureReceived = vi.fn();
    const onClose = vi.fn();

    renderModal(onSignatureReceived, onClose);

    await waitFor(() => expect(onSignatureReceived).toHaveBeenCalledTimes(1));
    expect(onSignatureReceived.mock.calls[0][0]).toEqual({
      kind: "text",
      text: "Reece",
      fontFamily: "Helvetica",
      color: "#000000",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores a non-image upload instead of setting it as the signature", async () => {
    // Rejecting the upload logs a warning - that's the contract under test.
    expectConsole.warn(/Ignoring non-image upload/);
    primeSession([{ filename: "evil.html", contentType: "text/html" }]);
    const onSignatureReceived = vi.fn();
    const onClose = vi.fn();

    renderModal(onSignatureReceived, onClose);

    // The poll + download cycle must have run before we assert the negative.
    await waitFor(() =>
      expect(
        mockedApi.get.mock.calls.some(([url]) =>
          String(url).includes("/download/"),
        ),
      ).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onSignatureReceived).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
