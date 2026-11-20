import type { StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  toolPanelMeta,
  toolPanelServer,
} from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import {
  openTooltip,
  untilPanelShows,
  STAGE_TIMEOUT,
  waitForPanelText,
  waitForToolPanel,
  type PlayContext,
} from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Convert/Panel",
  ...toolPanelMeta("convert"),
};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Stages no file, so the panel keeps the formats it was given instead of
 * detecting them from one: for a source with no fixture, or the empty Files step.
 */
const convertFrom = (fromExtension: string) => ({
  files: [],
  parameters: { fromExtension, toExtension: "pdf" },
});

const pdfTo = (toExtension: string) => ({ parameters: { toExtension } });

const ACCESSIBILITY_REPORT = "*/api/v1/security/accessibility-report";

const figuresNeedingDescription = (
  figures: { key: string; page: number; kind: string }[],
) =>
  toolPanelServer(
    http.post(ACCESSIBILITY_REPORT, () =>
      HttpResponse.json({ figuresNeedingDescription: figures }),
    ),
  );

async function findImages(context: PlayContext) {
  const panel = within(await waitForToolPanel(context));
  const find = await panel.findByRole(
    "button",
    { name: "Find images needing a description" },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(find).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(find);
  return panel;
}

async function openFormatMenu(context: PlayContext, label: RegExp) {
  const panel = within(await waitForToolPanel(context));
  const trigger = await panel.findByRole(
    "button",
    { name: label },
    STAGE_TIMEOUT,
  );
  await waitFor(() => expect(trigger).toBeEnabled(), STAGE_TIMEOUT);
  await userEvent.click(trigger);
  return within(context.canvasElement.ownerDocument.body);
}

export const Panel: Story = {};

export const NoSourceFormat: Story = {
  args: { files: [] },
  play: untilPanelShows("Choose a source format first"),
};

export const SourceFormatMenu: Story = {
  play: async (context) => {
    const body = await openFormatMenu(context, /^Convert from/);
    await body.findByTestId("format-option-docx", undefined, STAGE_TIMEOUT);
  },
};

export const TargetFormatMenu: Story = {
  play: async (context) => {
    const body = await openFormatMenu(context, /^Convert to/);
    await body.findByTestId("format-option-pdfua", undefined, STAGE_TIMEOUT);
  },
};

export const PdfToImage: Story = {
  args: pdfTo("png"),
  play: untilPanelShows("Image Options"),
};

export const PdfToWord: Story = {
  args: pdfTo("docx"),
  play: untilPanelShows("Use Stirling Office Convert"),
};

export const PdfToPdfA: Story = {
  args: pdfTo("pdfa"),
  play: untilPanelShows("PDF/A Options"),
};

export const PdfToPdfASigned: Story = {
  args: { ...pdfTo("pdfa"), files: ["signed-sample.pdf"] },
  play: untilPanelShows(/contains a digital signature/),
};

export const PdfToPdfUa: Story = {
  args: pdfTo("pdfua"),
  play: untilPanelShows("PDF/UA Options"),
};

export const PdfToPdfUaSigned: Story = {
  args: { ...pdfTo("pdfua"), files: ["signed-sample.pdf"] },
  play: untilPanelShows(/This PDF is digitally signed/),
};

export const PdfToPdfUaMultipleFiles: Story = {
  args: {
    ...pdfTo("pdfua"),
    files: ["sample.pdf", "multi-page-sample.pdf"],
    workbench: "fileEditor",
  },
  play: untilPanelShows(/Descriptions belong to one document/),
};

export const PdfToPdfUaImageDescriptions: Story = {
  args: pdfTo("pdfua"),
  parameters: figuresNeedingDescription([
    { key: "0:0", page: 1, kind: "Figure" },
    { key: "1:0", page: 2, kind: "Figure" },
  ]),
  play: async (context) => {
    const panel = await findImages(context);
    await panel.findByTestId("pdfua-alt-text-1:0", undefined, STAGE_TIMEOUT);
  },
};

export const PdfToPdfUaNoImagesMissingDescriptions: Story = {
  args: pdfTo("pdfua"),
  parameters: figuresNeedingDescription([]),
  play: async (context) => {
    const panel = await findImages(context);
    await panel.findByTestId("pdfua-no-figures", undefined, STAGE_TIMEOUT);
  },
};

export const PdfToPdfUaImageScanFailed: Story = {
  args: pdfTo("pdfua"),
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
  args: pdfTo("cbz"),
  play: untilPanelShows("PDF to CBZ Options"),
};

export const PdfToCbr: Story = {
  args: pdfTo("cbr"),
  play: untilPanelShows("PDF to CBR Options"),
};

export const PdfToEpub: Story = {
  args: pdfTo("epub"),
  play: untilPanelShows("Detect chapters"),
};

export const ImageToPdf: Story = {
  args: { files: ["sample.png"] },
  play: untilPanelShows("Fit Option"),
};

export const SvgToPdf: Story = {
  args: { files: ["sample.svg"] },
  play: untilPanelShows("SVG to PDF Options"),
};

export const OfficeToPdf: Story = {
  args: { files: ["sample.docx"] },
  play: untilPanelShows("Use Stirling Office Convert"),
};

export const HtmlToPdf: Story = {
  args: { files: ["sample.html"] },
  play: untilPanelShows("Web to PDF Options"),
};

export const HtmlToPdfWithStirlingOfficeConvert: Story = {
  args: {
    files: ["sample.html"],
    parameters: { useStirlingOfficeConvert: true },
  },
  play: async (context) => {
    const panel = await waitForPanelText(
      context,
      "Use Stirling Office Convert",
    );
    expect(panel.queryByText("Web to PDF Options")).toBeNull();
  },
};

export const EmailToPdf: Story = {
  args: { files: ["sample.eml"] },
  play: untilPanelShows("Maximum attachment size"),
};

export const EmailToHtmlWithoutAttachments: Story = {
  args: {
    files: ["sample.eml"],
    parameters: {
      emailOptions: {
        includeAttachments: false,
        maxAttachmentSizeMB: 10,
        downloadHtml: true,
        includeAllRecipients: false,
      },
    },
  },
  play: async (context) => {
    const panel = await waitForPanelText(context, "Email to PDF Options");
    expect(panel.queryByText("Maximum attachment size")).toBeNull();
    expect(panel.queryByText("Use Stirling Office Convert")).toBeNull();
  },
};

export const CbzToPdf: Story = {
  args: { files: ["sample.cbz"] },
  play: untilPanelShows("CBZ to PDF Options"),
};

export const CbrToPdf: Story = {
  args: convertFrom("cbr"),
  play: untilPanelShows("CBR Options"),
};

export const EbookToPdf: Story = {
  args: { files: ["sample.epub"] },
  play: untilPanelShows("Embed all fonts"),
};

export const TargetRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};

export const NoFilesTooltip: Story = {
  args: convertFrom("eml"),
  play: openTooltip({ runButton: true }),
};

export const ImageAutoRotateTooltip: Story = {
  args: { files: ["sample.png"] },
  play: openTooltip({ info: /^Automatically rotate images/ }),
};

export const ImageCombineTooltip: Story = {
  args: { files: ["sample.png"] },
  play: openTooltip({ info: /^Combine all images into one PDF/ }),
};

export const SvgVectorTooltip: Story = {
  args: { files: ["sample.svg"] },
  play: openTooltip({ info: /^SVG files are rendered as vector graphics/ }),
};

export const SvgCombineTooltip: Story = {
  args: { files: ["sample.svg"] },
  play: openTooltip({ info: /^Combine all SVG files into one PDF/ }),
};

export const StirlingOfficeConvertTooltip: Story = {
  args: { files: ["sample.docx"] },
  play: openTooltip({ info: /^Beta\. Better, faster conversions/ }),
};

export const CbzOptimizeForEbookTooltip: Story = {
  args: { files: ["sample.cbz"] },
  play: openTooltip({ info: /^Uses Ghostscript to reduce file size/ }),
};

export const CbrOptimizeForEbookTooltip: Story = {
  args: convertFrom("cbr"),
  play: openTooltip({ info: /^Uses Ghostscript to reduce file size/ }),
};

export const EbookEmbedFontsTooltip: Story = {
  args: { files: ["sample.epub"] },
  play: openTooltip({ info: /^Embed all fonts from the eBook/ }),
};

export const EbookTableOfContentsTooltip: Story = {
  args: { files: ["sample.epub"] },
  play: openTooltip({ info: /^Add a generated table of contents/ }),
};

export const EbookPageNumbersTooltip: Story = {
  args: { files: ["sample.epub"] },
  play: openTooltip({ info: /^Add page numbers to the generated PDF/ }),
};

export const EbookOptimizeTooltip: Story = {
  args: { files: ["sample.epub"] },
  play: openTooltip({ info: /^Optimize the PDF for eBook reading/ }),
};

export const EpubDetectChaptersTooltip: Story = {
  args: pdfTo("epub"),
  play: openTooltip({ info: /^Detect headings that look like chapters/ }),
};

export const EpubTargetDeviceTooltip: Story = {
  args: pdfTo("epub"),
  play: openTooltip({ info: /^Choose an output profile/ }),
};

export const EpubOutputFormatTooltip: Story = {
  args: pdfTo("epub"),
  play: openTooltip({ info: /^Choose the output format for the ebook/ }),
};

export const PdfAOutputFormatTooltip: Story = {
  args: pdfTo("pdfa"),
  play: openTooltip({ info: /^PDF\/A-1b is more compatible/ }),
};

export const PdfAStrictModeTooltip: Story = {
  args: pdfTo("pdfa"),
  play: openTooltip({ info: /^Error if conversion is not perfect/ }),
};

export const PdfUaLanguageTooltip: Story = {
  args: pdfTo("pdfua"),
  play: openTooltip({ info: /^A BCP-47 tag such as en-US/ }),
};

export const PdfUaOverrideLanguageTooltip: Story = {
  args: pdfTo("pdfua"),
  play: openTooltip({ info: /^Only tick this if the language above/ }),
};

export const PdfUaTitleTooltip: Story = {
  args: pdfTo("pdfua"),
  play: openTooltip({ info: /^Shown by a reader instead of the filename/ }),
};

export const PdfUaEmbedFontsTooltip: Story = {
  args: pdfTo("pdfua"),
  play: openTooltip({ info: /^PDF\/UA requires every font to be embedded/ }),
};
