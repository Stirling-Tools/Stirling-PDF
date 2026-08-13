/**
 * The whole Change Metadata form on one panel: delete-all, the standard fields,
 * the document dates and the advanced options, in that order.
 *
 * Two things decide what is editable. "Delete all metadata" makes every field
 * below it pointless, so ticking it locks the other three sections while
 * leaving their values on screen. The panel is also disabled wholesale by its
 * host — while the tool is running, or while metadata is still being read off
 * the selected file — and that locks the delete-all switch too.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import ChangeMetadataSingleStep from "@app/components/tools/changeMetadata/ChangeMetadataSingleStep";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import {
  defaultParameters,
  type ChangeMetadataParameters,
} from "@app/hooks/tools/changeMetadata/useChangeMetadataParameters";
import { TrappedStatus } from "@app/types/metadata";

/** A document whose metadata has already been read in, so every field is populated. */
const populated: ChangeMetadataParameters = {
  ...defaultParameters,
  title: "Q3 Supplier Agreement",
  author: "A. Okonkwo",
  subject: "Logistics framework terms",
  keywords: "logistics, framework, 2026",
  creator: "Stirling PDF",
  producer: "Stirling PDF",
  creationDate: new Date("2026-01-15T09:30:00Z"),
  modificationDate: new Date("2026-03-02T14:05:00Z"),
  trapped: TrappedStatus.FALSE,
  customMetadata: [
    { id: "custom1", key: "Department", value: "Procurement" },
    { id: "custom2", key: "Retention", value: "7 years" },
  ],
};

const meta = {
  title: "Tools/ChangeMetadata/ChangeMetadataSingleStep",
  component: ChangeMetadataSingleStep,
  parameters: { layout: "padded" },
  // The panel reads the view-scoped file list to pre-fill itself; with no files
  // loaded nothing is extracted and the form stands on the parameters given.
  decorators: [withToolContexts()],
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof ChangeMetadataSingleStep>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A fresh panel with nothing read in yet — every field empty and editable. */
export const Default: Story = {};

export const Populated: Story = { args: { parameters: populated } };

/** Delete-all ticked: the values stay visible but the sections below are locked. */
export const DeleteAll: Story = {
  args: { parameters: { ...populated, deleteAll: true } },
};

/** Locked by the host, so even the delete-all switch is out of reach. */
export const Disabled: Story = {
  args: { parameters: populated, disabled: true },
};
