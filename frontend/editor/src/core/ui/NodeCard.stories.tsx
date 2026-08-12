import type { Meta, StoryObj } from "@storybook/react-vite";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { NodeCard } from "@app/ui/NodeCard";
import { ActionIcon } from "@app/ui/ActionIcon";

const meta = {
  title: "UI/NodeCard",
  component: NodeCard,
  parameters: { layout: "padded" },
  args: {
    icon: <TuneRoundedIcon style={{ fontSize: "1.125rem" }} />,
    title: "Compress",
    detail: "level 7",
    onSelect: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: "16rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NodeCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The default tile: icon badge, title, one-line sub-detail, selectable. */
export const Default: Story = {};

/** Selected — the primary ring the inspector points at. */
export const Selected: Story = { args: { selected: true } };

/** Warning tone — an amber border, for a tile that needs attention. */
export const Warning: Story = {
  args: { tone: "warning", detail: "Needs setting up" },
};

/** A trailing control (here a remove button) sits beside the select target, not nested in it. */
export const WithTrailing: Story = {
  args: {
    trailing: (
      <ActionIcon
        variant="tertiary"
        size="sm"
        shape="circle"
        aria-label="Remove"
      >
        <CloseRoundedIcon style={{ fontSize: "0.875rem" }} />
      </ActionIcon>
    ),
  },
};
