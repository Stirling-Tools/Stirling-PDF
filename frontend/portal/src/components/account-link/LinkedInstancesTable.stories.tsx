import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { listInstances, type LinkedInstanceRow } from "@portal/mocks/link";
import { LinkedInstancesTable } from "@portal/components/account-link/LinkedInstancesTable";
import "@portal/views/AccountLink.css";

const meta: Meta<typeof LinkedInstancesTable> = {
  title: "Portal/AccountLink/LinkedInstancesTable",
  component: LinkedInstancesTable,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkedInstancesTable>;

/** Active + revoked instances; revoke flips status locally. */
export const Default: Story = {
  render: () => {
    const [rows, setRows] = useState<LinkedInstanceRow[]>(listInstances());
    return (
      <LinkedInstancesTable
        instances={rows}
        onRevoke={(i) =>
          setRows((rs) =>
            rs.map((r) =>
              r.instanceId === i.instanceId ? { ...r, revoked: true } : r,
            ),
          )
        }
      />
    );
  },
};

export const Empty: Story = {
  args: { instances: [], onRevoke: () => {} },
};
