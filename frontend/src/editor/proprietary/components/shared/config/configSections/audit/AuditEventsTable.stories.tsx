import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import AuditEventsTable from "@editor/components/shared/config/configSections/audit/AuditEventsTable";

/**
 * Table of audit events with sorting, an event-details modal, and pagination.
 * When `loginEnabled` is false (auth disabled), it shows built-in sample
 * events instead of calling the backend — used here to keep stories
 * deterministic without a live API.
 */
const meta: Meta<typeof AuditEventsTable> = {
  title: "Config/Audit/AuditEventsTable",
  component: AuditEventsTable,
  parameters: {
    layout: "padded",
    // The filters read these on mount; an unanswered read is not a list.
    msw: {
      handlers: [
        http.get("*/api/v1/proprietary/ui-data/audit-event-types", () =>
          HttpResponse.json(["USER_LOGIN", "USER_LOGOUT", "PDF_PROCESS"]),
        ),
        http.get("*/api/v1/proprietary/ui-data/audit-users", () =>
          HttpResponse.json(["admin", "editor"]),
        ),
      ],
    },
  },
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
