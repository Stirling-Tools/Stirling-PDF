import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { AppShell } from "@processor/components/AppShell";
import { Home } from "@processor/views/Home";

/**
 * The full shell (sidebar + mobile topbar/drawer + scrolling view column) with
 * the Home view inside. Resize the viewport below 48rem to exercise the mobile
 * chrome: the sidebar becomes an off-canvas drawer behind a scrim, opened from
 * the topbar hamburger.
 */
const meta: Meta<typeof AppShell> = {
  title: "Processor/Shell/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  decorators: [
    // The shell hosts the portal search bar, which reads the tool registry.
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AppShell>;

export const WithHomeView: Story = {
  render: () => (
    <AppShell>
      <Home />
    </AppShell>
  ),
};

export const Mobile: Story = {
  render: () => (
    <AppShell>
      <Home />
    </AppShell>
  ),
  globals: { viewport: { value: "mobile2", isRotated: false } },
};
