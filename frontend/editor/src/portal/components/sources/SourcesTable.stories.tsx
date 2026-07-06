import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SourceView } from "@portal/api/sources";
import { SourcesTable } from "@portal/components/sources/SourcesTable";

const SOURCES: SourceView[] = [
  {
    id: "src-claims",
    name: "Claims intake",
    type: "folder",
    status: "active",
    referenceCount: 2,
    referencingPolicies: [
      { id: "a", name: "Security Policy" },
      { id: "b", name: "Redaction Policy" },
    ],
    config: [
      { label: "Directory", value: "/data/claims-intake" },
      { label: "Mode", value: "consume" },
    ],
    docsTotal: 45230,
    docs24h: 312,
    docs30d: 9870,
  },
  {
    id: "src-archive",
    name: "Archive reprocess",
    type: "folder",
    status: "unused",
    referenceCount: 0,
    referencingPolicies: [],
    config: [{ label: "Directory", value: "/data/archive" }],
    docsTotal: 1180,
    docs24h: 0,
    docs30d: 0,
  },
  {
    id: "src-legacy",
    name: "Legacy share (paused)",
    type: "folder",
    status: "disabled",
    referenceCount: 0,
    referencingPolicies: [],
    config: [{ label: "Directory", value: "/mnt/legacy" }],
    docsTotal: 48600,
    docs24h: 0,
    docs30d: 0,
  },
];

const meta: Meta<typeof SourcesTable> = {
  title: "Portal/Sources/SourcesTable",
  component: SourcesTable,
  parameters: { layout: "padded" },
  args: { sources: SOURCES, expandedId: null, onRowClick: () => {} },
};
export default meta;
type Story = StoryObj<typeof SourcesTable>;

export const Default: Story = {};

/** A row with an open detail panel rotates its caret. */
export const RowExpanded: Story = {
  args: { expandedId: SOURCES[0].id },
};
