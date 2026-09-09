import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { PipelineBuilder } from "@processor/views/PipelineBuilder";

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
  title: "Processor/Views/PipelineBuilder",
  component: PipelineBuilder,
  parameters: { layout: "fullscreen" },
  decorators: [
    // The builder sizes itself against the shell's view - a fixed-height, non-scrolling box - which
    // is what lets it cap its columns instead of lengthening the page. Given an auto-height parent
    // its `height: 100%` resolves to nothing and the cap silently stops applying, so the story has
    // to honour that contract or it reviews a layout the app never renders.
    // Matches .processor-shell__view: a definite height with `auto` overflow, so the capped desktop
    // layout has something to size against and the stacked layout can still scroll.
    (Story) => (
      <div style={{ height: "100dvh", overflowY: "auto" }}>
        <Story />
      </div>
    ),
    // The builder reads the tool registry (for step labels + settings UIs), so
    // it needs this provider to render at all.
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

/**
 * A chain taller than the page. The graph column scrolls on its own so the header and the inspector
 * stay where they are - if the page scrolled instead, selecting a step near the end of the chain
 * would carry its settings off-screen.
 */
export const LongChain: Story = {
  decorators: [withRoute("/processor/pipelines/plc-long")],
};
