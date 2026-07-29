import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { UIProvider } from "@portal/contexts/UIContext";
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
  parameters: { layout: "fullscreen" },
  // The builder reads the tool registry (picker + per-step settings), the
  // sources query cache and, via the source modal, the UI context - so stories
  // supply the providers the app mounts in PortalApp.
  decorators: [
    (Story) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <UIProvider>
          <ToolRegistryProvider>
            <Story />
          </ToolRegistryProvider>
        </UIProvider>
      </QueryClientProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PipelineBuilder>;

/**
 * New-pipeline mode against the seeded mock backend. The overview strip on top
 * renders the spec projection by default; its Flow segment switches to the
 * vertical flow projection of the same state.
 */
export const New: Story = {
  decorators: [withRoute("/processor/pipelines/new")],
};

/** Editing a seeded pipeline: pre-filled name, sources, trigger and steps. */
export const Edit: Story = {
  decorators: [withRoute("/processor/pipelines/plc-redaction")],
};
