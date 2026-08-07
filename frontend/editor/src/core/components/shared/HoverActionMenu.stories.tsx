import type { Meta, StoryObj } from "@storybook/react-vite";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import HoverActionMenu from "@app/components/shared/HoverActionMenu";

const action = (
  id: string,
  label: string,
  icon: React.ReactNode,
  over: Record<string, unknown> = {},
) => ({ id, label, icon, onClick: () => {}, ...over });

const ACTIONS = [
  action("edit", "Rename", <EditRoundedIcon fontSize="small" />),
  action("download", "Download", <DownloadRoundedIcon fontSize="small" />),
  action("share", "Share", <ShareRoundedIcon fontSize="small" />),
  action("delete", "Delete", <DeleteRoundedIcon fontSize="small" />),
];

/** The row of actions that appears over a card on hover. Hidden actions are
 *  dropped entirely, and the menu renders nothing when none remain — so a card
 *  with no available actions gets no empty affordance. */
const meta: Meta<typeof HoverActionMenu> = {
  title: "Shared/HoverActionMenu",
  component: HoverActionMenu,
  parameters: { layout: "centered" },
  args: { show: true, actions: ACTIONS },
  decorators: [
    (Story) => (
      <div
        style={{
          position: "relative",
          width: 260,
          height: 150,
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          background: "var(--c-surface)",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HoverActionMenu>;

/** All four actions, seated inside the card. */
export const Default: Story = {};

/** Seated outside the card's edge. */
export const OutsidePosition: Story = { args: { position: "outside" } };

/** Not shown — the card is not hovered. */
export const Hidden: Story = { args: { show: false } };

/** One action disabled: still listed, so its absence isn't mistaken for a
 *  missing feature. */
export const WithDisabledAction: Story = {
  args: {
    actions: [
      ACTIONS[0],
      action("download", "Download", <DownloadRoundedIcon fontSize="small" />, {
        disabled: true,
        tooltip: "Still processing",
      }),
      ACTIONS[3],
    ],
  },
};

/** An action hidden outright — dropped rather than greyed. */
export const WithHiddenAction: Story = {
  args: {
    actions: [ACTIONS[0], { ...ACTIONS[2], hidden: true }, ACTIONS[3]],
  },
};

/** Every action hidden: the menu renders nothing at all. */
export const AllHidden: Story = {
  args: { actions: ACTIONS.map((a) => ({ ...a, hidden: true })) },
};

/** A single action. */
export const SingleAction: Story = { args: { actions: [ACTIONS[3]] } };

/** Driven by CSS hover rather than React state — hover the card to reveal. */
export const CssHoverVisibility: Story = {
  args: { visibility: "cssHover", show: false },
};
