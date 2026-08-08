import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubcategoryId } from "@app/data/toolsTaxonomy";
import { type ExecutableTool } from "@app/hooks/tools/shared/toolAutomation";
import { ToolPicker } from "@portal/components/pipelines/ToolPicker";

const tools: ExecutableTool[] = [
  {
    toolId: "merge",
    name: "Merge",
    icon: "🧩",
    subcategoryId: SubcategoryId.GENERAL,
    endpoint: "/api/v1/general/merge-pdfs",
    support: "noSettings",
  },
  {
    toolId: "split",
    name: "Split",
    icon: "✂️",
    subcategoryId: SubcategoryId.GENERAL,
    endpoint: "/api/v1/general/split-pages",
    support: "editable",
  },
  {
    toolId: "watermark",
    name: "Watermark",
    icon: "💧",
    subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
    endpoint: "/api/v1/security/add-watermark",
    support: "editable",
  },
  {
    toolId: "removePassword",
    name: "Remove password",
    icon: "🔓",
    subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
    endpoint: "/api/v1/security/remove-password",
    support: "editable",
  },
  {
    toolId: "ocr",
    name: "OCR",
    icon: "🔍",
    subcategoryId: SubcategoryId.EXTRACTION,
    endpoint: "/api/v1/misc/ocr-pdf",
    support: "editable",
  },
];

const meta = {
  title: "Portal/Pipelines/ToolPicker",
  component: ToolPicker,
  parameters: { layout: "padded" },
  args: {
    tools,
    onPick: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof ToolPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Full tool list grouped by category, as offered when adding a pipeline step. */
export const Default: Story = {};

/** No tools match the registry (or the search filter), showing the empty state. */
export const NoMatches: Story = {
  args: {
    tools: [],
  },
};
