import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  NewSignatureTile,
  SignatureTile,
} from "@app/components/tools/sign/wallet/SignatureTile";

const SIGNATURE =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><path d="M10 60 C 40 10 60 10 70 50 S 110 70 130 40 S 170 20 190 50 L 230 40" stroke="black" fill="none" stroke-width="3" stroke-linecap="round"/></svg>',
  );

const actions = [
  {
    id: "place",
    label: "Place on page",
    icon: "locate-fixed" as const,
    onSelect: () => {},
  },
  {
    id: "rename",
    label: "Rename",
    icon: "pencil" as const,
    onSelect: () => {},
  },
  {
    id: "default",
    label: "Make default",
    icon: "star" as const,
    onSelect: () => {},
  },
  {
    id: "delete",
    label: "Delete",
    icon: "trash" as const,
    danger: true,
    onSelect: () => {},
  },
];

const meta = {
  title: "Tools/Sign/SignatureTile",
  component: SignatureTile,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 132 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: "My signature",
    dataUrl: SIGNATURE,
    selected: false,
    actions,
    onClick: () => {},
  },
} satisfies Meta<typeof SignatureTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SelectedDefault: Story = {
  args: { selected: true, isDefault: true },
};

export const Unsaved: Story = {
  args: { label: "Typed signature", badge: "Unsaved" },
};

export const NewTile: Story = {
  render: () => <NewSignatureTile label="New signature" onClick={() => {}} />,
};
