import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PipelineView } from "@portal/api/pipelines";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";

const PIPELINES: PipelineView[] = [
  {
    id: "pipe-intake",
    name: "Claims intake",
    enabled: true,
    status: "active",
    trigger: "folder-watch",
    sources: [{ id: "src-claims", name: "Claims intake" }],
    steps: ["redact", "sanitize", "watermark"],
    output: "folder",
    owner: "jane@stirlingpdf.com",
  },
  {
    id: "pipe-archive",
    name: "Archive reprocess",
    enabled: false,
    status: "paused",
    trigger: "manual",
    sources: [],
    steps: [],
    output: "inline",
    owner: "jane@stirlingpdf.com",
  },
];

const meta: Meta<typeof PipelinesTable> = {
  title: "Portal/Pipelines/PipelinesTable",
  component: PipelinesTable,
  parameters: { layout: "padded" },
  args: { pipelines: PIPELINES, onRowClick: () => {} },
};
export default meta;
type Story = StoryObj<typeof PipelinesTable>;

export const Default: Story = {};

export const Empty: Story = {
  args: { pipelines: [] },
};
