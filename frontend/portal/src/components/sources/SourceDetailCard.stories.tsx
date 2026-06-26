import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SourceView } from "@portal/api/sources";
import { SourceDetailCard } from "@portal/components/sources/SourceDetailCard";

const SAMPLE_SERIES: number[] = Array.from({ length: 30 }, (_, i) =>
  Math.round(330 * (0.5 + Math.abs(Math.sin((i + 1) / 3)))),
);

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
  docsDaily: SAMPLE_SERIES,
};

const ORPHANED: SourceView = {
  id: "src-archive",
  name: "Archive reprocess",
  type: "folder",
  status: "unused",
  referenceCount: 0,
  referencingPolicies: [],
  config: [{ label: "Directory", value: "/data/archive" }],
  docsTotal: 45230,
  docs24h: 312,
  docs30d: 9870,
  docsDaily: SAMPLE_SERIES,
};

const meta: Meta<typeof SourceDetailCard> = {
  title: "Portal/Sources/SourceDetailCard",
  component: SourceDetailCard,
  parameters: { layout: "padded" },
  args: {
    onClose: () => {},
    onEdit: () => {},
    onTogglePause: () => {},
    onDelete: () => {},
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "56rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceDetailCard>;

export const InUse: Story = { args: { source: IN_USE } };
export const Orphaned: Story = { args: { source: ORPHANED } };
