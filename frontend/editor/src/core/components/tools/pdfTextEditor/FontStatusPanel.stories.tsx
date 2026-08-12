/**
 * The font report in the text editor: how faithfully each font in the document
 * can be reproduced when it is exported again.
 *
 * The panel derives everything from the document it is given. Each font is
 * graded — a standard PDF font or a fully embedded one is perfect, an embedded
 * subset warns that newly typed characters may be missing, and a font that is
 * neither embedded nor available to the backend is missing — and the headline
 * colour, message and summary badges follow from the worst grade present.
 * Passing a `pageIndex` narrows the report to the fonts that page actually
 * uses and retitles it accordingly. A document with no fonts renders nothing,
 * which is why every story below supplies some.
 *
 * The "fallback" summary badge has no story: the analysis never assigns that
 * grade, so nothing can produce it.
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FontStatusPanel from "@app/components/tools/pdfTextEditor/FontStatusPanel";
import type {
  PdfJsonDocument,
  PdfJsonFont,
} from "@app/tools/pdfTextEditor/pdfTextEditorTypes";

/** One of the standard 14: always present in a reader, so always perfect. */
const HELVETICA: PdfJsonFont = {
  id: "F1",
  baseName: "Helvetica",
  subtype: "Type1",
  encoding: "WinAnsiEncoding",
  embedded: false,
};

/** Embedded whole, so even edited text exports exactly. */
const INTER: PdfJsonFont = {
  id: "F2",
  baseName: "Inter-Regular",
  subtype: "TrueType",
  encoding: "WinAnsiEncoding",
  embedded: true,
  webProgramFormat: "woff2",
};

/** Embedded, but only the glyphs the document already uses. */
const INTER_SUBSET: PdfJsonFont = {
  id: "F3",
  baseName: "ABCDEE+Inter-Bold",
  subtype: "TrueType",
  encoding: "WinAnsiEncoding",
  embedded: true,
  webProgramFormat: "woff2",
};

/** Neither embedded nor held by the backend, so export substitutes it. */
const BARLOW: PdfJsonFont = {
  id: "F4",
  baseName: "Barlow-Medium",
  subtype: "TrueType",
  encoding: "MacRomanEncoding",
  embedded: false,
};

function doc(fonts: PdfJsonFont[]): PdfJsonDocument {
  return { fonts, pages: [] };
}

/** Only Helvetica is used on the first page; Inter appears elsewhere. */
const PAGED_DOCUMENT: PdfJsonDocument = {
  fonts: [HELVETICA, INTER],
  pages: [
    {
      pageNumber: 1,
      textElements: [{ text: "Quarterly summary", fontId: "F1" }],
    },
    {
      pageNumber: 2,
      textElements: [{ text: "Appendix", fontId: "F2" }],
    },
  ],
};

/** The report sits in the editor's side column. */
const inPanel = (Story: () => ReactElement) => (
  <div style={{ maxWidth: 340 }}>
    <Story />
  </div>
);

const meta = {
  title: "Tools/PdfTextEditor/FontStatusPanel",
  component: FontStatusPanel,
  decorators: [inPanel],
  args: {
    document: doc([HELVETICA, INTER]),
    onCollapsedChange: () => {},
  },
} satisfies Meta<typeof FontStatusPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Every font reproduces exactly, so the panel is green and reassuring. */
export const AllFontsPerfect: Story = {};

/** A subset and an unembedded font drop the headline to a warning. */
export const WithWarnings: Story = {
  args: { document: doc([HELVETICA, INTER_SUBSET, BARLOW]) },
};

/** Scoped to one page, which reports only the fonts that page draws with. */
export const CurrentPageOnly: Story = {
  args: { document: PAGED_DOCUMENT, pageIndex: 0 },
};

/** Collapsed to its header, dimmed, with the detail folded away. */
export const Collapsed: Story = {
  args: { document: doc([HELVETICA, INTER_SUBSET, BARLOW]), isCollapsed: true },
};
