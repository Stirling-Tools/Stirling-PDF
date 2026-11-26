import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import AuditExportSection from "@editor/components/shared/config/configSections/audit/AuditExportSection";

const meta = {
  title: "Config/AuditExportSection",
  component: AuditExportSection,
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
    loginEnabled: true,
    captureFileHash: false,
    capturePdfAuthor: false,
    captureOperationResults: false,
  },
} satisfies Meta<typeof AuditExportSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** All optional PDF/file metadata fields enabled and selectable. */
export const AllFieldsEnabled: Story = {
  args: {
    captureFileHash: true,
    capturePdfAuthor: true,
    captureOperationResults: true,
  },
};

/** Without an active login, the format, fields, filters, and export button are all disabled. */
export const LoginDisabled: Story = {
  args: { loginEnabled: false },
};
