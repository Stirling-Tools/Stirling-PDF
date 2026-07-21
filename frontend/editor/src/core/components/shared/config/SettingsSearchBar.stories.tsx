import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsSearchBar } from "@app/components/shared/config/SettingsSearchBar";
import type { ConfigNavSection } from "@app/components/shared/config/configNavSections";

const mockConfigNavSections: ConfigNavSection[] = [
  {
    title: "Preferences",
    items: [
      {
        key: "general",
        label: "General",
        icon: "settings-rounded",
        component: null,
      },
      {
        key: "hotkeys",
        label: "Keyboard Shortcuts",
        icon: "keyboard-rounded",
        component: null,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        key: "people",
        label: "People",
        icon: "group-rounded",
        component: null,
      },
      {
        key: "teams",
        label: "Teams",
        icon: "groups-rounded",
        component: null,
        disabled: true,
      },
    ],
  },
];

const meta = {
  title: "Shared/Config/SettingsSearchBar",
  component: SettingsSearchBar,
  parameters: { layout: "padded" },
  args: {
    configNavSections: mockConfigNavSections,
    onNavigate: async () => {},
    isMobile: false,
  },
} satisfies Meta<typeof SettingsSearchBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  args: {
    isMobile: true,
  },
};
