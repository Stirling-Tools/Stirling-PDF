import type { PolicyCategory } from "@processor/api/policies";
import { policyCategoryIcon } from "@editor/components/policies/policyCategoryIcon";
import "@processor/components/policies/PolicyCategoryIcon.css";

/** A neutral gray rounded badge holding the category's shared outline icon. */
export function PolicyCategoryBadge({
  category,
}: {
  category: PolicyCategory;
}) {
  return (
    <span className="pcat-badge" aria-hidden>
      {policyCategoryIcon(category.id)}
    </span>
  );
}
