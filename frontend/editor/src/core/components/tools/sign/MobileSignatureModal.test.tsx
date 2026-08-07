/**
 * Receive-flow contract for the phone-signature QR modal.
 *
 * The transfer session's upload endpoint accepts any file from anyone holding
 * the QR URL, so the modal must treat arrivals as untrusted: only images become
 * the signature; anything else is ignored. On a valid image it hands the data
 * URL to the caller and closes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import MobileSignatureModal from "@app/components/tools/sign/MobileSignatureModal";
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

function primeSession(files: Array<{ filename: string; contentType: string }>) {
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
        data: new Blob(["fake-bytes"], { type: meta?.contentType }),
        config,
      } as never);
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  }) as never);
}

function renderModal(
  onSignatureReceived: (d: string) => void,
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

  it("hands a received image to the caller as a data URL and closes", async () => {
    primeSession([{ filename: "signature-1.png", contentType: "image/png" }]);
    const onSignatureReceived = vi.fn();
    const onClose = vi.fn();

    renderModal(onSignatureReceived, onClose);

    await waitFor(() => expect(onSignatureReceived).toHaveBeenCalledTimes(1));
    expect(onSignatureReceived.mock.calls[0][0]).toMatch(/^data:image\/png/);
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
