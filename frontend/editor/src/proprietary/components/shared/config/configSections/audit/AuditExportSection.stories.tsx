import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditExportSection from "@app/components/shared/config/configSections/audit/AuditExportSection";

const meta = {
  title: "Config/AuditExportSection",
  component: AuditExportSection,
  parameters: { layout: "padded" },
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
