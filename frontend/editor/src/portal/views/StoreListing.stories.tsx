import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { StoreListing } from "@portal/views/StoreListing";

/** Renders the detail at a listing URL so its `:storeId` param resolves as in the app. */
function withRoute(path: string) {
  return function RouteDecorator(Story: () => React.ReactElement) {
    return (
      <Routes location={path}>
        <Route path="/processor/store/:storeId" element={<Story />} />
      </Routes>
    );
  };
}

const meta: Meta<typeof StoreListing> = {
  title: "Portal/Views/StoreListing",
  component: StoreListing,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof StoreListing>;

/** A curated listing from another team: no author is shown, one parameter is set on install. */
export const Default: Story = {
  decorators: [withRoute("/processor/store/sp-9q4w7e2r")],
};

/** A listing published by the viewer's own team: the author line names the publisher. */
export const Teammate: Story = {
  decorators: [withRoute("/processor/store/sp-8k2m4q7x")],
};
