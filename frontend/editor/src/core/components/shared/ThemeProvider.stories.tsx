import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

// ThemeProvider reads/writes the active theme via usePreferences(), which the
// Storybook preview's own provider tree doesn't supply — wrap it here.
const meta = {
  title: "Shared/ThemeProvider",
  component: ThemeProvider,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
} satisfies Meta<typeof ThemeProvider>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <div>Themed content</div>,
  },
};
