import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { PipelineBuilder } from "@portal/views/PipelineBuilder";

/**
 * Renders the builder at a specific path so its `:id` route param resolves the
 * same way it does in the app, without nesting a second Router inside the
 * preview's MemoryRouter.
 */
function withRoute(path: string) {
  return function RouteDecorator(Story: () => React.ReactElement) {
    return (
      <Routes location={path}>
        <Route path="/processor/pipelines/new" element={<Story />} />
        <Route path="/processor/pipelines/:id" element={<Story />} />
      </Routes>
    );
  };
}

const meta: Meta<typeof PipelineBuilder> = {
  title: "Portal/Views/PipelineBuilder",
  component: PipelineBuilder,
  parameters: { layout: "padded" },
  // The builder reads the tool registry (for step labels + settings UIs), so
  // it needs this provider to render at all.
  decorators: [
    (Story) => (
      <ToolRegistryProvider>
        <Story />
      </ToolRegistryProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineBuilder>;

/** A new, unsaved pipeline: empty operation chain, no sources selected yet. */
export const Default: Story = {
  decorators: [withRoute("/processor/pipelines/new")],
};

/** Editing a seeded pipeline: pre-filled name, sources, trigger and steps. */
export const Edit: Story = {
  decorators: [withRoute("/processor/pipelines/plc-redaction")],
};
