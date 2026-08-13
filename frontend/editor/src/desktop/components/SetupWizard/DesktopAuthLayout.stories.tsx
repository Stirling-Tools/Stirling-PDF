/**
 * The frame every desktop setup-wizard screen sits in. It contributes the
 * branding and centring; the screen itself is passed as children.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DesktopAuthLayout } from "@app/components/SetupWizard/DesktopAuthLayout";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof DesktopAuthLayout> = {
  title: "Desktop/SetupWizard/DesktopAuthLayout",
  component: DesktopAuthLayout,
  parameters: { layout: "fullscreen" },
  // The shell's wordmark resolves a logo variant through PreferencesContext.
  decorators: [
    (Story) => (
      <PreferencesProvider>
        <Story />
      </PreferencesProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DesktopAuthLayout>;

export const Default: Story = {
  args: { children: <p>Sign-in form goes here.</p> },
};

/** Taller content, where the frame has to scroll rather than clip. */
export const TallContent: Story = {
  args: {
    children: (
      <div style={{ display: "grid", gap: "1rem" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i}>Setup step detail line {i + 1}</p>
        ))}
      </div>
    ),
  },
};
