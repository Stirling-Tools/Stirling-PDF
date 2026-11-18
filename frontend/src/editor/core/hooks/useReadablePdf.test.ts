import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import { useReadablePdf } from "@editor/hooks/useReadablePdf";
import { clearPdfAccess } from "@editor/services/pdfAccessService";
import {
  clearRightsManagedPdfs,
  isMicrosoftProtectedPdf,
} from "@editor/services/rightsManagedPdf";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  openInViewer,
  pdfFile,
  rememberSessionPassword,
} from "@editor/tests/utils/protectedPdfFixtures";

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: async () => "",
}));

const COVER = "%PDF-1.7 cover /MicrosoftIRMServices";

beforeEach(() => {
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.post).mockReset();
  clearPdfAccess();
  clearRightsManagedPdfs();
});

describe("useReadablePdf", () => {
  it("reads an unprotected PDF as stored", async () => {
    const file = createStirlingFile(pdfFile("%PDF-1.7 plain"));
    const { result } = renderHook(() => useReadablePdf(file));

    await waitFor(() => expect(result.current).toEqual({ file }));
  });

  it("opens a password-protected PDF with the session password", async () => {
    const file = createStirlingFile(pdfFile("%PDF-1.7 locked"));
    rememberSessionPassword(file, "secret");
    const { result } = renderHook(() => useReadablePdf(file));

    await waitFor(() =>
      expect(result.current).toEqual({ file, password: "secret" }),
    );
  });

  it("picks up a password entered while it is showing", async () => {
    const file = createStirlingFile(pdfFile("%PDF-1.7 locked"));
    const { result } = renderHook(() => useReadablePdf(file));
    await waitFor(() => expect(result.current).toEqual({ file }));

    act(() => rememberSessionPassword(file, "secret"));

    expect(result.current).toEqual({ file, password: "secret" });
  });

  it("reads the decrypted copy of a Purview PDF opened in the viewer", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    const opened = await openInViewer(file, "%PDF-1.7 report");
    const { result } = renderHook(() => useReadablePdf(file));
    await act(() => isMicrosoftProtectedPdf(file));

    expect(result.current).toEqual({ file: opened.plaintext });
  });

  it("has nothing to read until the viewer opens a Purview PDF", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    const { result } = renderHook(() => useReadablePdf(file));
    await act(() => isMicrosoftProtectedPdf(file));

    expect(result.current).toBeNull();

    const opened = await act(() => openInViewer(file, "%PDF-1.7 report"));

    expect(result.current).toEqual({ file: opened.plaintext });
  });

  it("opens a Purview PDF itself when exactly one Microsoft account is connected", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        enabled: true,
        available: true,
        accounts: [{ id: 7, status: "CONNECTED", email: "pat@contoso.com" }],
      },
    });
    const file = createStirlingFile(pdfFile(COVER));
    renderHook(() => useReadablePdf(file));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/rights-management/open",
        expect.any(FormData),
        expect.objectContaining({ params: { accountId: 7 } }),
      ),
    );
  });

  it("keeps the same result between unrelated renders", async () => {
    const file = createStirlingFile(pdfFile("%PDF-1.7 plain"));
    const { result, rerender } = renderHook(() => useReadablePdf(file));
    await waitFor(() => expect(result.current).not.toBeNull());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
