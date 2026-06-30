import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailPanel } from "@portal/components/sources/SourceDetailPanel";

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
  docsTotal: null,
};

const ORPHANED: SourceView = {
  id: "src-archive",
  name: "Archive reprocess",
  type: "folder",
  status: "unused",
  referenceCount: 0,
  referencingPolicies: [],
  config: [{ label: "Directory", value: "/data/archive" }],
  docsTotal: null,
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

export const InUse: Story = { args: { source: IN_USE } };
/** A source no policy references is called out as safe to delete. */
export const Orphaned: Story = { args: { source: ORPHANED } };
