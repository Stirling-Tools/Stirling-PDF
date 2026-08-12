/**
 * The layer that paints a PDF's push-button widgets over a rendered page.
 *
 * What it shows is decided entirely by the appearances PDFium renders out of
 * the document bytes: it draws one canvas per button found on `pageIndex` and
 * returns nothing when there are none. With no source — the state it is mounted
 * in until the viewer has a document — there is nothing to resolve, so the
 * layer is empty. Page dimensions only scale bitmaps that already exist, so
 * varying them cannot produce a second state here.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ButtonAppearanceOverlay } from "@app/tools/formFill/ButtonAppearanceOverlay";

const meta = {
  title: "Tools/FormFill/ButtonAppearanceOverlay",
  component: ButtonAppearanceOverlay,
  args: {
    pageIndex: 0,
    pdfSource: null,
    pageWidth: 612,
    pageHeight: 792,
  },
} satisfies Meta<typeof ButtonAppearanceOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
