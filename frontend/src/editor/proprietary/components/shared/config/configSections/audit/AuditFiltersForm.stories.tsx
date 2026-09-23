import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditFiltersForm from "@app/components/shared/config/configSections/audit/AuditFiltersForm";
import { AuditFilters } from "@app/services/auditService";

/**
 * Shared filter form for audit components: quick date presets, event type / user
 * multi-selects, and start/end date pickers.
 */
const meta: Meta<typeof AuditFiltersForm> = {
  title: "Config/Audit/AuditFiltersForm",
  component: AuditFiltersForm,
  parameters: { layout: "padded" },
  args: {
    eventTypes: ["LOGIN", "LOGOUT", "FILE_UPLOAD", "FILE_DOWNLOAD"],
    users: ["alice", "bob", "carol"],
    onFilterChange: () => {},
    onClearFilters: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    filters: {},
  },
};

/** With some filters already applied. */
export const WithFiltersApplied: Story = {
  args: {
    filters: {
      eventType: ["LOGIN"],
      username: ["alice"],
      startDate: "2026-07-01",
      endDate: "2026-07-15",
    },
  },
};

/** All inputs disabled, e.g. while a request is in flight. */
export const Disabled: Story = {
  args: {
    filters: {},
    disabled: true,
  },
};

/** Interactive: filter state updates live as the form is used. */
export const Interactive: Story = {
  render: (args) => {
    function InteractiveForm() {
      const [filters, setFilters] = useState<AuditFilters>({});
      return (
        <AuditFiltersForm
          {...args}
          filters={filters}
          onFilterChange={(key, value) =>
            setFilters((prev) => ({ ...prev, [key]: value }))
          }
          onClearFilters={() => setFilters({})}
        />
      );
    }
    return <InteractiveForm />;
  },
};
