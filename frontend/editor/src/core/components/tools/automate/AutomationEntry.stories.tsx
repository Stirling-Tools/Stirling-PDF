/**
 * A single row in the Automate list — a saved workflow, a suggested one, or the
 * entry that starts a new one.
 *
 * A `title` names the row outright; without one the row spells out its tool
 * chain instead, with an arrow between each step. Those step labels come from
 * the tool registry when it is passed and from the translation bundle
 * otherwise, so a registry is only worth passing for an operation the bundle
 * has no name for — it changes the wording, never the shape, and so gets no
 * story of its own. `keepIconColor` holds the badge in the accent colour, which
 * is how the "create new" row sets itself apart from the saved ones.
 *
 * The overflow menu is present whenever `showMenu` is set but stays faded out
 * until the row is hovered or the menu is open, so the story that covers it
 * hovers the row first.
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "storybook/test";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutomationEntry from "@app/components/tools/automate/AutomationEntry";

/** The Automate panel is a narrow column and the row fills it. */
const inPanel = (Story: () => ReactElement) => (
  <div style={{ maxWidth: 340 }}>
    <Story />
  </div>
);

const meta = {
  title: "Tools/Automate/AutomationEntry",
  component: AutomationEntry,
  decorators: [inPanel],
  args: {
    operations: ["compress", "flatten"],
    onClick: () => {},
  },
} satisfies Meta<typeof AutomationEntry>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A suggested workflow, which names itself by its chain of tools. */
export const Default: Story = {};

/** A saved workflow: its own name, with the chain kept for the tooltip. */
export const NamedAutomation: Story = {
  args: {
    title: "Monthly board pack",
    description: "Shrinks the pack and locks the forms before it goes out.",
    badgeIcon: AutoAwesomeIcon,
    operations: ["compress", "flatten", "addPassword"],
  },
};

/**
 * The row that starts a new workflow: accented badge, no chain to describe, and
 * so no tooltip either.
 */
export const CreateNewEntry: Story = {
  args: {
    title: "Create new automation",
    badgeIcon: AddIcon,
    keepIconColor: true,
    operations: [],
    onImport: () => {},
    showMenu: true,
  },
};

/** Hovered, which fades in the overflow menu the row keeps its actions behind. */
export const MenuRevealedOnHover: Story = {
  args: {
    title: "Nightly redaction pass",
    badgeIcon: AutoAwesomeIcon,
    operations: ["redact", "sanitize"],
    showMenu: true,
    onEdit: () => {},
    onDelete: () => {},
    onExportAutomation: () => {},
    onExportFolderScan: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.hover(
      canvas.getByRole("button", { name: "Nightly redaction pass" }),
    );
  },
};
