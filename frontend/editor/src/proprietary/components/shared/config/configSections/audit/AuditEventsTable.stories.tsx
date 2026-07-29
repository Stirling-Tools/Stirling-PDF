import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditEventsTable from "@app/components/shared/config/configSections/audit/AuditEventsTable";

/**
 * Table of audit events with sorting, an event-details modal, and pagination.
 * When `loginEnabled` is false (auth disabled), it shows built-in sample
 * events instead of calling the backend — used here to keep stories
 * deterministic without a live API.
 */
const meta: Meta<typeof AuditEventsTable> = {
  title: "Config/Audit/AuditEventsTable",
  component: AuditEventsTable,
  parameters: { layout: "padded" },
  args: {
    loginEnabled: false,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Adds the "Author" and "File Hash" columns when PDF metadata capture is enabled. */
export const WithFileMetadataColumns: Story = {
  args: {
    captureFileHash: true,
    capturePdfAuthor: true,
  },
};
