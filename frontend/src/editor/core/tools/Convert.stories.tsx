import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor } from "storybook/test";
import {
  endpointUnavailable,
  fixtureResponse,
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  bodyOf,
  openSelect,
  openTooltip,
  panelOf,
  type PanelQueries,
  type PlayContext,
  runTool,
  runToResults,
  selectOption,
  STAGE_TIMEOUT,
  toggle,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";
import type { FixtureName } from "@editor/components/tools/toolPanelStory/fixtures";

const meta = {
  title: "Tools/Convert/Panel",
  ...toolPanelMeta("convert"),
};
export default meta;

type Story = StoryObj<typeof meta>;

type FormatDropdown = "convert-from-dropdown" | "convert-to-dropdown";

/** The checkbox's label holds its (i), so its accessible name starts with this. */

async function openFormatMenu(
  context: PlayContext,
  dropdown: FormatDropdown,
): Promise<PanelQueries> {
  const panel = await panelOf(context);
  const trigger = await panel.findByTestId(dropdown, undefined, STAGE_TIMEOUT);
  await waitFor(() => expect(trigger).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(trigger);
  return bodyOf(context);
}

async function pickFormat(
  context: PlayContext,
  dropdown: FormatDropdown,
  format: string,
): Promise<PanelQueries> {
  const body = await openFormatMenu(context, dropdown);
  const option = await body.findByTestId(
    `format-option-${format}`,
    undefined,
    STAGE_TIMEOUT,
  );
  await userEvent.click(option);
  await waitFor(() =>
    expect(body.queryByTestId(`format-option-${format}`)).toBeNull(),
  );
  return panelOf(context);
}

const convertTo = (format: string) => (context: PlayContext) =>
  pickFormat(context, "convert-to-dropdown", format);

const convertFrom = (format: string) => (context: PlayContext) =>
  pickFormat(context, "convert-from-dropdown", format);

async function expectFormat(
  context: PlayContext,
  dropdown: FormatDropdown,
  label: string,
): Promise<PanelQueries> {
  const panel = await panelOf(context);
  await waitFor(
    () => expect(panel.getByTestId(dropdown)).toHaveTextContent(label),
    STAGE_TIMEOUT,
  );
  return panel;
}

async function expectSection(
  panel: PanelQueries,
  testId: string,
): Promise<HTMLElement> {
  const section = await panel.findByTestId(testId, undefined, STAGE_TIMEOUT);
  await expect(section).toBeVisible();
  return section;
}

/** The file editor works on every selected file; the viewer only on the one it shows. */
const inFileEditor = (files: readonly FixtureName[]) => ({
  files,
  workbench: "fileEditor" as const,
});

export const Panel: Story = {
  play: async (context) => {
    await expectFormat(context, "convert-from-dropdown", "Document (PDF)");
    await expectFormat(context, "convert-to-dropdown", "Target format");
  },
};

export const NoFiles: Story = {
  args: { files: [] },
  play: async (context) => {
    const panel = await expectFormat(
      context,
      "convert-from-dropdown",
      "Source format",
    );
    const target = panel.getByRole("button", { name: /^Convert to/ });
    await expect(target).toBeDisabled();
    await expect(target).toHaveTextContent("Choose a source format first");
  },
};

export const NoFilesTooltip: Story = {
  args: { files: [] },
  play: openTooltip({ runButton: true }),
};

export const SourceFormatMenu: Story = {
  play: async (context) => {
    const body = await openFormatMenu(context, "convert-from-dropdown");
    await body.findByTestId("format-option-docx", undefined, STAGE_TIMEOUT);
  },
};

/**
 * Conversions that need an account in the desktop app's local mode, where
 * choosing one asks the user to sign in instead (Tools/Convert/Desktop).
 */
const NEEDS_ACCOUNT_ON_DESKTOP = ["not-in-desktop"];

export const SourceFormatUnavailable: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: toolPanelServer(...endpointUnavailable("file-to-pdf")),
  play: async (context) => {
    const body = await openFormatMenu(context, "convert-from-dropdown");
    await expect(
      await body.findByTestId("format-option-docx", undefined, STAGE_TIMEOUT),
    ).toBeDisabled();
  },
};

export const SourceMatchingNoLoadedFile: Story = {
  play: async (context) => {
    const panel = await convertFrom("docx")(context);
    await expectFormat(context, "convert-to-dropdown", "Document (PDF)");
    await expect(panel.getByText(/sample\.pdf/)).toBeVisible();
    await waitFor(() =>
      expect(panel.getByTestId("convert-button")).toBeEnabled(),
    );
  },
};

export const TargetFormatMenu: Story = {
  play: async (context) => {
    const body = await openFormatMenu(context, "convert-to-dropdown");
    await body.findByTestId("format-option-pdfua", undefined, STAGE_TIMEOUT);
  },
};

export const TargetFormatUnavailable: Story = {
  parameters: toolPanelServer(...endpointUnavailable("pdf-to-img")),
  play: async (context) => {
    const body = await openFormatMenu(context, "convert-to-dropdown");
    await expect(
      await body.findByTestId("format-option-png", undefined, STAGE_TIMEOUT),
    ).toBeDisabled();
  },
};

export const TargetRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const ConversionUnavailableTooltip: Story = {
  args: { files: ["sample.docx"] },
  parameters: toolPanelServer(...endpointUnavailable("file-to-pdf")),
  play: openTooltip({ runButton: true }),
};

export const PdfToImage: Story = {
  play: async (context) => {
    const panel = await convertTo("png")(context);
    await expectSection(panel, "image-options-section");
    await expect(panel.getByTestId("dpi-input")).toHaveValue("300");
  },
};

export const PdfToImageColorTypes: Story = {
  play: async (context) => {
    await convertTo("png")(context);
    const types = await openSelect(context, "Color Type");
    await types.findByRole("option", { name: "Black & White" });
  },
};

export const PdfToImageOutputOptions: Story = {
  play: async (context) => {
    await convertTo("png")(context);
    const outputs = await openSelect(context, "Output");
    await outputs.findByRole("option", { name: "Single" });
  },
};

export const PdfToWord: Story = {
  play: async (context) => {
    await convertTo("docx")(context);
    await expectFormat(context, "convert-to-dropdown", "Document (DOCX)");
  },
};

export const PdfToPdfX: Story = {
  play: async (context) => {
    await convertTo("pdfx")(context);
    await expectFormat(context, "convert-to-dropdown", "Document (PDF/X)");
  },
};

export const PdfToPdfUa: Story = {
  play: async (context) => {
    const panel = await convertTo("pdfua")(context);
    await expectSection(panel, "pdfua-settings");
    await expect(panel.getByTestId("pdfua-language-input")).toHaveValue(
      "en-US",
    );
  },
};

export const PdfUaConformanceLevels: Story = {
  play: async (context) => {
    await convertTo("pdfua")(context);
    const levels = await openSelect(context, "Conformance level");
    await levels.findByRole("option", { name: "PDF/UA-2 (PDF 2.0)" });
  },
};

export const PdfToPdfUaSigned: Story = {
  args: { files: ["signed-sample.pdf"] },
  play: async (context) => {
    const panel = await convertTo("pdfua")(context);
    await panel.findByText(
      /This PDF is digitally signed/,
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const PdfToPdfUaMultipleFiles: Story = {
  args: inFileEditor(["sample.pdf", "multi-page-sample.pdf"]),
  play: async (context) => {
    const panel = await convertTo("pdfua")(context);
    await expectSection(panel, "pdfua-alt-text-single-file-only");
  },
};

export const PdfUaLanguageTooltip: Story = {
  play: openTooltip(
    { info: /^A BCP-47 tag such as en-US/ },
    { after: convertTo("pdfua") },
  ),
};

export const PdfUaOverrideLanguageTooltip: Story = {
  play: openTooltip(
    { info: /^Only tick this if the language above is right/ },
    { after: convertTo("pdfua") },
  ),
};

export const PdfUaTitleTooltip: Story = {
  play: openTooltip(
    { info: /^Shown by a reader instead of the filename/ },
    { after: convertTo("pdfua") },
  ),
};

export const PdfUaEmbedFontsTooltip: Story = {
  play: openTooltip(
    { info: /^PDF\/UA requires every font to be embedded/ },
    { after: convertTo("pdfua") },
  ),
};

const ACCESSIBILITY_REPORT = "*/api/v1/security/accessibility-report";

const figuresNeedingDescription = (
  figures: { key: string; page: number; kind: string }[],
) =>
  toolPanelServer(
    http.post(ACCESSIBILITY_REPORT, () =>
      HttpResponse.json({ figuresNeedingDescription: figures }),
    ),
  );

async function findImages(context: PlayContext): Promise<PanelQueries> {
  const panel = await convertTo("pdfua")(context);
  const find = await panel.findByTestId(
    "pdfua-find-figures",
    undefined,
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(find).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(find);
  return panel;
}

export const PdfToPdfUaImageDescriptions: Story = {
  parameters: figuresNeedingDescription([
    { key: "0:0", page: 1, kind: "Figure" },
    { key: "1:0", page: 2, kind: "Figure" },
  ]),
  play: async (context) => {
    const panel = await findImages(context);
    const description = await panel.findByTestId(
      "pdfua-alt-text-1:0",
      undefined,
      STAGE_TIMEOUT,
    );
    await userEvent.type(description, "A bar chart of sales by quarter");
    await expect(description).toHaveValue("A bar chart of sales by quarter");
  },
};

export const PdfToPdfUaNoImagesMissingDescriptions: Story = {
  parameters: figuresNeedingDescription([]),
  play: async (context) => {
    const panel = await findImages(context);
    await panel.findByTestId("pdfua-no-figures", undefined, STAGE_TIMEOUT);
  },
};

export const PdfToPdfUaImageScanFailed: Story = {
  parameters: toolPanelServer(
    http.post(ACCESSIBILITY_REPORT, () =>
      HttpResponse.json({ error: "Scan failed" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    const panel = await findImages(context);
    await panel.findByText(
      /The images could not be listed/,
      undefined,
      STAGE_TIMEOUT,
    );
  },
};

export const PdfToCbz: Story = {
  play: async (context) => {
    await expectSection(await convertTo("cbz")(context), "cbz-output-settings");
  },
};

export const PdfToCbr: Story = {
  play: async (context) => {
    await expectSection(await convertTo("cbr")(context), "cbr-output-settings");
  },
};

export const PdfToEpub: Story = {
  play: async (context) => {
    const panel = await convertTo("epub")(context);
    await expectSection(panel, "epub-settings");
    await expect(
      panel.getByRole("checkbox", { name: /^Detect chapters/ }),
    ).toBeChecked();
  },
};

export const PdfToEpubTargetDevices: Story = {
  play: async (context) => {
    await convertTo("epub")(context);
    const devices = await openSelect(context, /^Target device/);
    await devices.findByRole("option", {
      name: "Kindle e-Ink (text optimized)",
    });
  },
};

export const PdfToAzw3: Story = {
  play: async (context) => {
    await convertTo("epub")(context);
    await selectOption(context, /^Output format/, "AZW3");
    await expectFormat(context, "convert-to-dropdown", "eBook (AZW3)");
  },
};

export const EpubDetectChaptersTooltip: Story = {
  play: openTooltip(
    { info: /^Detect headings that look like chapters/ },
    { after: convertTo("epub") },
  ),
};

export const EpubTargetDeviceTooltip: Story = {
  play: openTooltip(
    { info: /^Choose an output profile/ },
    { after: convertTo("epub") },
  ),
};

export const ImageToPdf: Story = {
  args: { files: ["sample.png"] },
  play: async (context) => {
    const panel = await panelOf(context);
    await expectSection(panel, "pdf-options-section");
    await expect(
      panel.getByRole("checkbox", { name: /^Auto Rotate/ }),
    ).toBeChecked();
    await expect(
      panel.getByRole("checkbox", { name: /^Combine Images/ }),
    ).toBeChecked();
  },
};

export const ImageToPdfFitOptions: Story = {
  args: { files: ["sample.png"] },
  play: async (context) => {
    const fits = await openSelect(context, "Fit Option");
    await fits.findByRole("option", { name: "Fill Page" });
  },
};

export const ImageToPdfSeparateFiles: Story = {
  args: { files: ["sample.png"] },
  play: async (context) => {
    await toggle(context, "checkbox", /^Combine Images/);
  },
};

export const ImageAutoRotateTooltip: Story = {
  args: { files: ["sample.png"] },
  play: openTooltip({ info: /^Automatically rotate images/ }),
};

export const ImageCombineTooltip: Story = {
  args: { files: ["sample.png"] },
  play: openTooltip({ info: /^Combine all images into one PDF/ }),
};

export const MultipleImagesToPdf: Story = {
  args: inFileEditor(["sample.png", "sample.jpg"]),
  play: async (context) => {
    const panel = await expectFormat(
      context,
      "convert-from-dropdown",
      "Multiple Files (Images)",
    );
    await expectSection(panel, "pdf-options-section");
  },
};

export const MixedFilesToPdf: Story = {
  args: inFileEditor(["sample.docx", "sample.png"]),
  play: async (context) => {
    await expectFormat(
      context,
      "convert-from-dropdown",
      "Multiple Files (Any)",
    );
  },
};

export const SvgToPdf: Story = {
  args: { files: ["sample.svg"] },
  play: async (context) => {
    const panel = await panelOf(context);
    await expectSection(panel, "svg-pdf-options-section");
    await expect(
      panel.getByRole("checkbox", { name: /^Combine SVGs into single PDF/ }),
    ).toBeChecked();
  },
};

export const SvgVectorTooltip: Story = {
  args: { files: ["sample.svg"] },
  play: openTooltip({ info: /^SVG files are rendered as vector graphics/ }),
};

export const SvgCombineTooltip: Story = {
  args: { files: ["sample.svg"] },
  play: openTooltip({ info: /^Combine all SVG files into one PDF/ }),
};

export const OfficeToPdf: Story = {
  args: { files: ["sample.docx"] },
  play: async (context) => {
    await expectFormat(context, "convert-to-dropdown", "Document (PDF)");
  },
};

export const MarkdownToPdf: Story = {
  args: { files: ["sample.md"] },
  play: async (context) => {
    await expectFormat(context, "convert-to-dropdown", "Document (PDF)");
  },
};

export const HtmlToPdf: Story = {
  args: { files: ["sample.html"] },
  play: async (context) => {
    const panel = await panelOf(context);
    await expectSection(panel, "web-settings");
    await expect(panel.getByTestId("zoom-level-input")).toHaveValue("1");
  },
};

export const EmailToPdf: Story = {
  args: { files: ["sample.eml"] },
  play: async (context) => {
    const panel = await panelOf(context);
    await expectSection(panel, "email-settings");
    await expectSection(panel, "max-attachment-size-input");
  },
};

export const EmailWithoutAttachments: Story = {
  args: { files: ["sample.eml"] },
  play: async (context) => {
    const panel = await toggle(
      context,
      "checkbox",
      "Include email attachments",
    );
    await waitFor(() =>
      expect(panel.queryByTestId("max-attachment-size-input")).toBeNull(),
    );
  },
};

export const EmailToHtml: Story = {
  args: { files: ["sample.eml"] },
  play: async (context) => {
    await toggle(
      context,
      "checkbox",
      "Download HTML intermediate file instead of PDF",
    );
  },
};

export const EmailWithAllRecipients: Story = {
  args: { files: ["sample.eml"] },
  play: async (context) => {
    await toggle(
      context,
      "checkbox",
      "Include CC and BCC recipients in header",
    );
  },
};

const OPTIMIZE_FOR_EBOOK_INFO = /^Uses Ghostscript to reduce file size/;

export const CbzToPdf: Story = {
  args: { files: ["sample.cbz"] },
  play: async (context) => {
    await expectSection(await panelOf(context), "cbz-settings");
  },
};

export const CbzOptimizeForEbookTooltip: Story = {
  args: { files: ["sample.cbz"] },
  play: openTooltip({ info: OPTIMIZE_FOR_EBOOK_INFO }),
};

export const CbrToPdf: Story = {
  args: { files: [] },
  play: async (context) => {
    await expectSection(await convertFrom("cbr")(context), "cbr-settings");
  },
};

export const CbrOptimizeForEbookTooltip: Story = {
  args: { files: [] },
  play: openTooltip(
    { info: OPTIMIZE_FOR_EBOOK_INFO },
    { after: convertFrom("cbr") },
  ),
};

export const EbookToPdf: Story = {
  args: { files: ["sample.epub"] },
  play: async (context) => {
    const panel = await panelOf(context);
    for (const option of [
      /^Include table of contents/,
      /^Include page numbers/,
      /^Optimize for ebook readers/,
    ])
      await expect(
        await panel.findByRole("checkbox", { name: option }, STAGE_TIMEOUT),
      ).not.toBeChecked();
  },
};

export const EbookOptimizeTooltip: Story = {
  args: { files: ["sample.epub"] },
  play: openTooltip({ info: /^Optimize the PDF for eBook reading/ }),
};

export const UnlistedFileTypeToPdf: Story = {
  args: { files: ["valid-test-cert.pem"] },
  play: async (context) => {
    await expectFormat(context, "convert-from-dropdown", "File (PEM)");
    await expectFormat(context, "convert-to-dropdown", "Document (PDF)");
  },
};

const convertsToPdfX = toolPanelServer(
  fixtureResponse("/api/v1/convert/pdf/pdfa", "sample.pdf"),
);

async function runConversion(context: PlayContext): Promise<void> {
  await convertTo("pdfx")(context);
  await runToResults(context);
}

export const ConversionResults: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: convertsToPdfX,
  play: runConversion,
};

export const UndoConversionTooltip: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: convertsToPdfX,
  play: openTooltip({ info: "Undo" }, { after: runConversion }),
};

export const ConversionFailed: Story = {
  tags: NEEDS_ACCOUNT_ON_DESKTOP,
  parameters: toolPanelServer(
    http.post("*/api/v1/convert/pdf/pdfa", () =>
      HttpResponse.json({ error: "Conversion failed" }, { status: 500 }),
    ),
  ),
  play: async (context) => {
    await convertTo("pdfx")(context);
    const panel = await runTool(context);
    await panel.findByText("Error", undefined, STAGE_TIMEOUT);
  },
};
