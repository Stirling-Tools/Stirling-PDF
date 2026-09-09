import type { Meta, StoryObj } from "@storybook/react-vite";
import PerPageSection from "@app/components/tools/getPdfInfo/sections/PerPageSection";
import type { PdfPerPageInfo } from "@app/types/getPdfInfo";

const perPage: PdfPerPageInfo = {
  "Page 1": {
    Size: {
      "Width (px)": "612",
      "Height (px)": "792",
      "Width (in)": "8.5",
      "Height (in)": "11",
      "Standard Page": "Letter",
    },
    Rotation: 0,
    "Page Orientation": "Portrait",
    MediaBox: "[0.0, 0.0, 612.0, 792.0]",
    CropBox: "[0.0, 0.0, 612.0, 792.0]",
    "Text Characters Count": 1284,
    Annotations: {
      AnnotationsCount: 2,
      SubtypeCount: 1,
      ContentsCount: 1,
    },
    Images: [{ Name: "Im0", Width: 400, Height: 300, ColorSpace: "DeviceRGB" }],
    Links: [{ URI: "https://stirlingpdf.com" }],
    Fonts: [
      { Name: "Helvetica", IsEmbedded: true, Subtype: "Type1" },
      { Name: "Times-Roman", IsEmbedded: false, Subtype: "Type1" },
    ],
    XObjectCounts: { Image: 1, Form: 0, Other: 0 },
    Multimedia: [],
  },
  "Page 2": {
    Size: {
      "Width (px)": "612",
      "Height (px)": "792",
      "Standard Page": "Letter",
    },
    Rotation: 90,
    "Page Orientation": "Landscape",
    MediaBox: "[0.0, 0.0, 612.0, 792.0]",
    "Text Characters Count": 0,
    Images: [],
    Links: [],
    Fonts: [],
    Multimedia: [],
  },
};

const meta = {
  title: "GetPdfInfo/PerPageSection",
  component: PerPageSection,
  parameters: { layout: "padded" },
  args: {
    anchorId: "per-page-info",
  },
} satisfies Meta<typeof PerPageSection>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    perPage,
  },
};

export const Empty: Story = {
  args: {
    perPage: null,
  },
};
