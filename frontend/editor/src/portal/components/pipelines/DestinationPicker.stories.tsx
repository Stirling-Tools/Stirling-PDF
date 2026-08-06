import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DestinationPicker } from "@portal/components/pipelines/DestinationPicker";
import "@portal/views/PipelineBuilder.css";

const SOURCES = [
  { id: "s3-archive", name: "S3 archive" },
  { id: "claims-out", name: "Claims outbox" },
  { id: "contracts-signed", name: "Contracts — signed" },
  { id: "sharepoint", name: "SharePoint / Legal" },
];

/** Where a pipeline writes its output. Creating a new location leaves the
 *  builder, so that action is deliberately separated from the picker itself. */
const meta: Meta<typeof DestinationPicker> = {
  title: "Portal/Pipelines/DestinationPicker",
  component: DestinationPicker,
  parameters: { layout: "padded" },
  args: { onChange: () => {}, onCreateNew: () => {} },
};
export default meta;

type Story = StoryObj<typeof DestinationPicker>;

/** Nothing chosen yet. */
export const Empty: Story = {
  args: { sources: SOURCES, value: [] },
};

/** One destination selected. */
export const OneSelected: Story = {
  args: { sources: SOURCES, value: ["s3-archive"] },
};

/** Fanning out to several destinations at once. */
export const MultipleSelected: Story = {
  args: { sources: SOURCES, value: ["s3-archive", "sharepoint"] },
};

/** No destinations exist yet — the only way forward is to create one. */
export const NoSourcesAvailable: Story = {
  args: { sources: [], value: [] },
};

/** Live: pick and clear destinations to watch the selection round-trip. */
export const Interactive: Story = {
  render: () => {
    const [value, setValue] = useState<string[]>(["claims-out"]);
    return (
      <DestinationPicker
        sources={SOURCES}
        value={value}
        onChange={setValue}
        onCreateNew={() => {}}
      />
    );
  },
};
