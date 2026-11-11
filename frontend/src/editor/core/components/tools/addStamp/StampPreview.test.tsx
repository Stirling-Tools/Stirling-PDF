import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StampPreview from "@editor/components/tools/addStamp/StampPreview";
import { defaultParameters } from "@editor/components/tools/addStamp/useAddStampParameters";
import { clearPdfAccess } from "@editor/services/pdfAccessService";
import { clearRightsManagedPdfs } from "@editor/services/rightsManagedPdf";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  openInViewer,
  pdfFile,
  rememberSessionPassword,
  servePdfs,
} from "@editor/tests/utils/protectedPdfFixtures";

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
const thumbnails = vi.hoisted(() => ({ requestThumbnail: vi.fn() }));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjs.getDocument,
}));
vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: async () => "",
}));
vi.mock("@editor/hooks/useThumbnailGeneration", () => ({
  useThumbnailGeneration: () => thumbnails,
}));

const COVER = "%PDF-1.7 cover /MicrosoftIRMServices";
const REPORT = "%PDF-1.7 landscape report";
const LETTER = { width: 612, height: 792 };
const LANDSCAPE = { width: 792, height: 612 };
const qrStamp = {
  ...defaultParameters,
  stampType: "qr" as const,
  stampText: "https://stirlingpdf.com",
};

let containerWidth: ReturnType<typeof vi.spyOn>;

function renderPreview(file: File) {
  return render(
    <MantineProvider>
      <StampPreview
        parameters={qrStamp}
        onParameterChange={vi.fn()}
        file={file}
      />
    </MantineProvider>,
  );
}

async function expectPageShape(
  container: HTMLElement,
  page: { width: number; height: number },
) {
  await waitFor(() =>
    expect(
      container.querySelector<HTMLElement>('[style*="aspect-ratio"]')?.style
        .aspectRatio,
    ).toBe(`${page.width / page.height} / 1`),
  );
}

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  thumbnails.requestThumbnail.mockReset();
  thumbnails.requestThumbnail.mockResolvedValue(null);
  clearPdfAccess();
  clearRightsManagedPdfs();
  containerWidth = vi
    .spyOn(Element.prototype, "clientWidth", "get")
    .mockReturnValue(300);
});
afterEach(() => containerWidth.mockRestore());

describe("StampPreview with protected PDFs", () => {
  it("lays the stamp out on an unprotected page as stored", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, page: LANDSCAPE }),
    );

    const { container } = renderPreview(file);

    await expectPageShape(container, LANDSCAPE);
  });

  it("lays the stamp out on a password-protected page opened with the session password", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    rememberSessionPassword(file, "secret");
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, password: "secret", page: LANDSCAPE }),
    );

    const { container } = renderPreview(file);

    await expectPageShape(container, LANDSCAPE);
  });

  it("lays the stamp out on the decrypted page of an opened Purview PDF, not its cover", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    await openInViewer(file, REPORT);
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, page: LETTER },
        { text: REPORT, page: LANDSCAPE },
      ),
    );

    const { container } = renderPreview(file);

    await expectPageShape(container, LANDSCAPE);
  });

  it("previews the decrypted page of an opened Purview PDF", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    const opened = await openInViewer(file, REPORT);
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, page: LETTER },
        { text: REPORT, page: LANDSCAPE },
      ),
    );
    thumbnails.requestThumbnail.mockImplementation(
      async (_pageId: string, source: File) =>
        source === opened.plaintext ? "decrypted-page.png" : "cover-page.png",
    );

    renderPreview(file);

    await waitFor(() =>
      expect(screen.getByAltText("addStamp.pagePreviewAlt")).toHaveAttribute(
        "src",
        "decrypted-page.png",
      ),
    );
  });
});
