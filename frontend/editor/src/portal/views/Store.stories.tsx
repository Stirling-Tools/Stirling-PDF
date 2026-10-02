import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { Route, Routes } from "react-router-dom";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { Store } from "@portal/views/Store";

const SAAS = "http://saas.mock";

/**
 * Mounts the view at a store URL so its search-param state (tab, filters) resolves the same way it
 * does in the app, without nesting a second Router inside the preview's MemoryRouter.
 */
function withRoute(path: string) {
  return function RouteDecorator(Story: () => React.ReactElement) {
    return (
      <Routes location={path}>
        <Route path="/processor/store" element={<Story />} />
      </Routes>
    );
  };
}

const meta: Meta<typeof Store> = {
  title: "Portal/Views/Store",
  component: Store,
  parameters: { layout: "padded" },
  decorators: [
    // Cards draw each step's registry glyph, so the tool registry has to be present.
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Store>;

/** Browse tab over the seeded listings: search, category, sort and a three-column grid. */
export const Default: Story = {
  decorators: [withRoute("/processor/store")],
};

/** A search with no hits: the empty state offers to clear the filters. */
export const Empty: Story = {
  decorators: [withRoute("/processor/store?q=nothing-matches-this")],
  parameters: {
    msw: {
      handlers: [
        http.get(`${SAAS}/api/v1/store/public/pipelines`, () =>
          HttpResponse.json({ items: [], nextCursor: null, total: 0 }),
        ),
      ],
    },
  },
};

/** The viewer's starred listings, as the same cards. */
export const Starred: Story = {
  decorators: [withRoute("/processor/store?tab=starred")],
};

/** The team's own listings: status, counts, and the row menu (view, republish, copy, remove). */
export const Published: Story = {
  decorators: [withRoute("/processor/store?tab=published")],
};
