import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";

const CATEGORIES: SidebarCategory[] = [
  { id: "finance", name: "Financial", icon: "payments", labelKeys: [] },
  { id: "legal", name: "Legal", icon: "gavel", labelKeys: [] },
  { id: "hr", name: "HR", icon: "badge", labelKeys: [] },
  { id: "reports", name: "Reports", icon: "monitoring", labelKeys: [] },
];

const COUNTS = new Map<string, number>([
  ["finance", 12],
  ["legal", 4],
  ["reports", 7],
]);

// The store is device-local; the story holds the hidden state so the toggle is live.
function Harness() {
  const [categories, setCategories] = useState(CATEGORIES);
  return (
    <div style={{ maxWidth: 420 }}>
      <ClassificationCategoryManager
        categories={categories}
        counts={COUNTS}
        onToggleHidden={(id, hidden) =>
          setCategories((prev) =>
            prev.map((c) => (c.id === id ? { ...c, hidden } : c)),
          )
        }
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: "Policies/ClassificationCategoryManager",
  component: Harness,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** Show/hide the fixed, shared categories in the Files sidebar. */
export const Default: Story = {};
