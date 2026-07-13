import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";
import { sampleDailySeries } from "@portal/mocks/sampleDailySeries";

const SAMPLE_SERIES = sampleDailySeries(330);

const IN_USE: SourceView = {
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
};

const ORPHANED: SourceView = {
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
};

const meta: Meta<typeof SourceDetailPanel> = {
  title: "Portal/Sources/SourceDetailPanel",
  component: SourceDetailPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "48rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceDetailPanel>;

export const InUse: Story = {
  args: { source: IN_USE, docSeries: SAMPLE_SERIES },
};
/** A source no policy references is called out as safe to delete. */
export const Orphaned: Story = { args: { source: ORPHANED, docSeries: [] } };
