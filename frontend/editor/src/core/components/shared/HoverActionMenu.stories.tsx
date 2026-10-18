import type { Meta, StoryObj } from "@storybook/react-vite";
import HoverActionMenu, {
  type HoverAction,
} from "@app/components/shared/HoverActionMenu";
import { Icon } from "@app/ui/Icon";

const actions: HoverAction[] = [
  {
    id: "edit",
    icon: <Icon name="pencil" size={16} />,
    label: "Edit",
    onClick: () => {},
  },
  {
    id: "download",
    icon: <Icon name="download" size={16} />,
    label: "Download",
    onClick: () => {},
  },
  {
    id: "delete",
    icon: <Icon name="trash" size={16} />,
    label: "Delete",
    onClick: () => {},
    color: "var(--text-error)",
  },
];

const meta: Meta<typeof HoverActionMenu> = {
  title: "Shared/HoverActionMenu",
  component: HoverActionMenu,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ position: "relative", width: "16rem", height: "4rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof HoverActionMenu>;

/** Visible menu with the standard edit/download/delete action set. */
export const Default: Story = {
  args: {
    show: true,
    actions,
  },
};

/** Hidden state (`show: false`) — menu stays mounted but faded/non-interactive. */
export const Hidden: Story = {
  args: {
    show: false,
    actions,
  },
};

/** One action disabled with a custom tooltip explaining why. */
export const WithDisabledAction: Story = {
  args: {
    show: true,
    actions: [
      actions[0],
      actions[1],
      {
        ...actions[2],
        disabled: true,
        tooltip: "Deletion is restricted by policy",
      },
    ],
  },
};
