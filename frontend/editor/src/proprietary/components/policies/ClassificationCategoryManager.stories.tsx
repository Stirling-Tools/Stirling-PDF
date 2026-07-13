import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ClassificationCategoryManager } from "@app/components/policies/ClassificationCategoryManager";
import type { ClassificationLabel } from "@app/data/classificationLabels";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";

// A small, readable vocabulary — enough to show categories, the pinned "Custom"
// group (memo / misc note sit in no category), search, and the delete-category
// warning without the full 260-label default set.
const LABELS: ClassificationLabel[] = [
  { id: "invoice", name: "Invoice" },
  { id: "receipt", name: "Receipt" },
  { id: "purchase-order", name: "Purchase order" },
  { id: "contract", name: "Contract" },
  { id: "nda", name: "NDA" },
  { id: "resume", name: "Resume" },
  { id: "cover-letter", name: "Cover letter" },
  { id: "memo", name: "Memo" },
  { id: "misc-note", name: "Misc note" },
];

const CATEGORIES: SidebarCategory[] = [
  {
    id: "financial",
    name: "Financial",
    icon: "folder",
    labelKeys: ["invoice", "receipt", "purchase-order"],
  },
  {
    id: "legal",
    name: "Legal",
    icon: "folder",
    labelKeys: ["contract", "nda"],
  },
  {
    id: "hr",
    name: "HR",
    icon: "folder",
    labelKeys: ["resume", "cover-letter"],
  },
];

const LABEL_COUNTS = new Map<string, number>([
  ["invoice", 12],
  ["receipt", 7],
  ["contract", 3],
  ["resume", 5],
  ["memo", 2],
]);

// Controlled harness: the manager owns no persistence, so a story wrapper holds
// the category / hidden / label state the real callers (editor store, staged
// processor draft) provide.
function ManagerHarness({
  editableLabels,
  ...props
}: {
  editableLabels?: boolean;
  canHide?: boolean;
  canManageTeamLabels?: boolean;
  searchable?: boolean;
}) {
  const [categories, setCategories] = useState(CATEGORIES);
  const [labels, setLabels] = useState(LABELS);
  const [hidden, setHidden] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 900 }}>
      <ClassificationCategoryManager
        labels={labels}
        categories={categories}
        onCategoriesChange={setCategories}
        hiddenLabels={new Set(hidden)}
        onHiddenLabelsChange={setHidden}
        onLabelsChange={editableLabels ? setLabels : undefined}
        labelCounts={LABEL_COUNTS}
        {...props}
      />
    </div>
  );
}

const meta: Meta<typeof ManagerHarness> = {
  title: "Policies/ClassificationCategoryManager",
  component: ManagerHarness,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof ManagerHarness>;

/**
 * Editor Files-sidebar variant (grouping-only, viewed by a team member). Labels
 * are read-only; deleting a category warns that the labels stay in the pool and
 * fall to "Custom", and tells the member to ask their team lead to remove them.
 */
export const EditorGrouping: Story = {
  args: { canHide: true, searchable: true, canManageTeamLabels: false },
};

/**
 * Same grouping-only variant, viewed by a team lead — the delete-category
 * warning instead points them to the processor to remove labels from the pool.
 */
export const EditorGroupingTeamLead: Story = {
  args: { canHide: true, searchable: true, canManageTeamLabels: true },
};

/**
 * Processor variant (full label editing). Icon pickers, add-label, and bulk
 * actions appear; deleting a category also deletes its labels from the team pool
 * ("Delete category and labels?").
 */
export const ProcessorLabels: Story = {
  args: { editableLabels: true, searchable: true },
};
