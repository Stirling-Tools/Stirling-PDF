import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { PORTAL_BASENAME } from "@portal/contexts/ViewContext";
import { Infrastructure } from "@portal/views/Infrastructure";

/**
 * The Infrastructure page: a header, an "Manage editor deployment" shortcut into
 * the editor, and one tab per infrastructure surface (deployments, API keys,
 * security, models, storage, audit). The page itself is only the shell — each
 * tab's content is its own component with its own stories.
 *
 * Which tab is open is local state seeded from a `?tab=` deep link, which other
 * surfaces use to send the user straight to a specific tab (the home
 * visualiser's outcome cards link to the audit log this way). The param is
 * consumed and dropped on arrival, so these stories render at a location
 * carrying it rather than clicking through the tab strip.
 */
function atTab(search: string) {
  return function TabDecorator(Story: () => React.ReactElement) {
    const path = `${PORTAL_BASENAME}/infrastructure`;
    return (
      <Routes location={`${path}${search}`}>
        <Route path={path} element={<Story />} />
      </Routes>
    );
  };
}

const meta: Meta<typeof Infrastructure> = {
  // AppShell renders every view inside <main>; standalone, this view's
  // own <header> would be promoted to a second banner landmark.
  decorators: [
    (Story: () => React.ReactElement) => (
      <main>
        <Story />
      </main>
    ),
  ],
  title: "Portal/Views/Infrastructure",
  component: Infrastructure,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Infrastructure>;

/** Arriving with no deep link: the deployments tab, seeded from the mocks. */
export const Default: Story = {};

/** Deep-linked to API keys — the tab strip moves and the key table takes over. */
export const ApiKeysTab: Story = {
  decorators: [atTab("?tab=api-keys")],
};

/** Deep-linked to the audit log, the route the outcome cards elsewhere use. */
export const AuditTab: Story = {
  decorators: [atTab("?tab=audit")],
};
