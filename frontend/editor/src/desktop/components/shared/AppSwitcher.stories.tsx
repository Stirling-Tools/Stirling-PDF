/**
 * Desktop shadows the brand header back to a plain logo: it inherits the
 * proprietary layers but ships no portal, so there is nothing to switch to.
 * Collapsing the sidebar drops the wordmark and leaves the mark alone.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppSwitcher } from "@app/components/shared/AppSwitcher";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof AppSwitcher> = {
  title: "Desktop/AppSwitcher",
  component: AppSwitcher,
  parameters: { layout: "padded" },
  // The logo resolves its variant through PreferencesContext.
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AppSwitcher>;

/** Expanded sidebar: mark and wordmark. */
export const Expanded: Story = { args: { collapsed: false } };

/** Collapsed rail: the mark only. */
export const Collapsed: Story = { args: { collapsed: true } };
