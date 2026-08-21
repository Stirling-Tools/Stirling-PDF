import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { AuditExportModal } from "@portal/components/infrastructure/AuditExportModal";
import "@portal/views/Infrastructure.css";

/**
 * Export modal for the Infrastructure → Audit tab. Rendered always-open here.
 * Downloads via the editor's real `/audit-export` endpoint (mocked by MSW), so
 * clicking "Export" pulls a sample CSV/JSON.
 */
const meta: Meta<typeof AuditExportModal> = {
  title: "Portal/Infrastructure/AuditExportModal",
  component: AuditExportModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof AuditExportModal>;

export const Open: Story = {};

/**
 * The export request fails - click "Export" to see the inline error message.
 * (Overrides the sample-export handler with a 500.)
 */
export const ExportFails: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(
          "*/api/v1/proprietary/ui-data/audit-export",
          () => new HttpResponse(null, { status: 500 }),
        ),
      ],
    },
  },
};
