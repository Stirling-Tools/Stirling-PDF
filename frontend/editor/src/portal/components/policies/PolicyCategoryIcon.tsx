import type { PolicyCategory } from "@portal/api/policies";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@portal/components/policies/PolicyCategoryIcon.css";

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
