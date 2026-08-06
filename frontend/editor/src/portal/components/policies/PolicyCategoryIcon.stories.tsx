import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyCategoryBadge } from "@portal/components/policies/PolicyCategoryIcon";
import { POLICY_CATEGORIES } from "@portal/components/policies/storyFixtures";
import "@portal/views/Policies.css";

/** The per-category glyph used in the catalogue table and cards. The badge is
 *  decorative — the row's own text names the category — so it is hidden from
 *  assistive technology rather than duplicating that name. */
const meta: Meta<typeof PolicyCategoryBadge> = {
  title: "Portal/Policies/PolicyCategoryBadge",
  component: PolicyCategoryBadge,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof PolicyCategoryBadge>;

/** One category. */
export const Default: Story = {
  args: { category: POLICY_CATEGORIES[0] },
};

/** Every category side by side — the set should read as one family, and no
 *  category should fall back to a blank badge. */
export const AllCategories: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1.25rem",
        alignItems: "flex-start",
      }}
    >
      {POLICY_CATEGORIES.map((category) => (
        <div
          key={category.id}
          style={{ display: "grid", justifyItems: "center", gap: "0.4rem" }}
        >
          <PolicyCategoryBadge category={category} />
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-muted)" }}>
            {category.id}
          </span>
        </div>
      ))}
    </div>
  ),
};
