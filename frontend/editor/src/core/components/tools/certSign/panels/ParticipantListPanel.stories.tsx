import type { Meta, StoryObj } from "@storybook/react-vite";
import { ParticipantListPanel } from "@app/components/tools/certSign/panels/ParticipantListPanel";
import type { ParticipantInfo } from "@app/types/signingSession";

const meta = {
  title: "CertSign/ParticipantListPanel",
  component: ParticipantListPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ParticipantListPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

const participants: ParticipantInfo[] = [
  {
    id: 1,
    userId: 101,
    email: "alice@example.com",
    name: "Alice Anderson",
    status: "SIGNED",
    lastUpdated: "2026-07-10T12:00:00Z",
  },
  {
    id: 2,
    userId: 102,
    email: "bob@example.com",
    name: "Bob Brown",
    status: "PENDING",
    lastUpdated: "2026-07-11T09:00:00Z",
  },
  {
    id: 3,
    userId: 103,
    email: "carol@example.com",
    name: "Carol Clark",
    status: "DECLINED",
    lastUpdated: "2026-07-12T15:30:00Z",
  },
];

export const Default: Story = {
  args: {
    participants,
    finalized: false,
    onRemove: () => {},
  },
};

export const Finalized: Story = {
  args: {
    participants,
    finalized: true,
    onRemove: () => {},
  },
};

export const Empty: Story = {
  args: {
    participants: [],
    finalized: false,
    onRemove: () => {},
  },
};
