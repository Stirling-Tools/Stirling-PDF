import type { Meta, StoryObj } from "@storybook/react-vite";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import { PanelHeader } from "@shared/components/PanelHeader";
import { StatusBadge } from "@shared/components/StatusBadge";

const meta: Meta<typeof PanelHeader> = {
  title: "Primitives/PanelHeader",
  component: PanelHeader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    icon: <ShieldOutlinedIcon sx={{ fontSize: "1rem" }} />,
    title: "Security",
    closeLabel: "Close",
  },
  argTypes: { onClose: { action: "close" } },
};
export default meta;
type Story = StoryObj<typeof PanelHeader>;

/** Plain header pill with a trailing close button. */
export const Playground: Story = {};

/** Category-accented icon badge (blue / purple / green / amber / red). */
export const Accented: Story = {
  args: { accent: "purple" },
};

/** Dropdown trigger — a disclosure chevron appears and clicking the pill opens
 *  the menu (e.g. the chat header's "Clear chat"). */
export const WithMenu: Story = {
  args: {
    title: "Stirling",
    menuLabel: "Stirling agent options",
    menuItems: [
      {
        key: "clear",
        icon: <DeleteSweepIcon sx={{ fontSize: 18 }} />,
        label: "Clear chat",
        onClick: () => {},
      },
    ],
  },
};

/** Loading state — pulsing status dot on the icon + a tinted border. */
export const Loading: Story = {
  args: { title: "Stirling", loading: true },
};

/** Right-aligned actions rendered before the close button. */
export const WithActions: Story = {
  args: {
    accent: "purple",
    actions: (
      <StatusBadge tone="success" showDot pulse>
        Active
      </StatusBadge>
    ),
  },
};
