import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CropSettings from "@editor/components/tools/crop/CropSettings";
import { useCropParameters } from "@editor/hooks/tools/crop/useCropParameters";
import { clearPdfAccess } from "@editor/services/pdfAccessService";
import { clearRightsManagedPdfs } from "@editor/services/rightsManagedPdf";
import { mantineTheme } from "@editor/theme/mantineTheme";
import {
  createStirlingFile,
  type StirlingFile,
} from "@editor/types/fileContext";
import {
  openInViewer,
  pdfFile,
  rememberSessionPassword,
  servePdfs,
} from "@editor/tests/utils/protectedPdfFixtures";

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
const workspace = vi.hoisted(() => ({
  files: [] as unknown[],
  fileStubs: [] as unknown[],
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfjs.getDocument,
}));
vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock("@editor/utils/thumbnailUtils", () => ({
  generateThumbnailForFile: async () => "decrypted-first-page.png",
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ activeFileIndex: 0 }),
}));
vi.mock("@editor/contexts/NavigationContext", () => ({
  useNavigationState: () => ({ workbench: "viewer" }),
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useAllFiles: () => workspace,
}));

const COVER = "%PDF-1.7 cover /MicrosoftIRMServices";
const REPORT = "%PDF-1.7 landscape report";
const LETTER = { width: 612, height: 792 };
const LANDSCAPE = { width: 792, height: 612 };

function show(file: StirlingFile) {
  workspace.files = [file];
  workspace.fileStubs = [
    { id: file.fileId, name: file.name, thumbnailUrl: "cover.png" },
  ];
}

function Crop() {
  const parameters = useCropParameters();
  return <CropSettings parameters={parameters} />;
}

function renderCrop() {
  return render(
    <MantineProvider theme={mantineTheme}>
      <Crop />
    </MantineProvider>,
  );
}

async function expectCropSize(width: string, height: string) {
  await waitFor(() =>
    expect(screen.getByLabelText("crop.coordinates.width.label")).toHaveValue(
      width,
    ),
  );
  expect(screen.getByLabelText("crop.coordinates.height.label")).toHaveValue(
    height,
  );
}

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  clearPdfAccess();
  clearRightsManagedPdfs();
});

describe("CropSettings with protected PDFs", () => {
  it("measures an unprotected PDF as stored", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    show(file);
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, page: LANDSCAPE }),
    );

    renderCrop();

    await expectCropSize("792", "612");
  });

  it("measures a password-protected PDF with the session password", async () => {
    const file = createStirlingFile(pdfFile(REPORT));
    rememberSessionPassword(file, "secret");
    show(file);
    pdfjs.getDocument.mockImplementation(
      servePdfs({ text: REPORT, password: "secret", page: LANDSCAPE }),
    );

    renderCrop();

    await expectCropSize("792", "612");
  });

  it("measures the decrypted copy of an opened Purview PDF, not its cover", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    await openInViewer(file, REPORT);
    show(file);
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, page: LETTER },
        { text: REPORT, page: LANDSCAPE },
      ),
    );

    renderCrop();

    await expectCropSize("792", "612");
  });

  it("previews the decrypted first page of an opened Purview PDF", async () => {
    const file = createStirlingFile(pdfFile(COVER));
    await openInViewer(file, REPORT);
    show(file);
    pdfjs.getDocument.mockImplementation(
      servePdfs(
        { text: COVER, page: LETTER },
        { text: REPORT, page: LANDSCAPE },
      ),
    );

    renderCrop();

    await waitFor(() =>
      expect(screen.getByAltText("filePreview.previewOf")).toHaveAttribute(
        "src",
        "decrypted-first-page.png",
      ),
    );
  });
});
