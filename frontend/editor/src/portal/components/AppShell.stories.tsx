import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "@portal/components/AppShell";
import { Home } from "@portal/views/Home";

/**
 * The full shell (sidebar + mobile topbar/drawer + scrolling view column) with
 * the Home view inside. Resize the viewport below 48rem to exercise the mobile
 * chrome: the sidebar becomes an off-canvas drawer behind a scrim, opened from
 * the topbar hamburger.
 */
const meta: Meta<typeof AppShell> = {
  title: "Portal/Shell/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
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
