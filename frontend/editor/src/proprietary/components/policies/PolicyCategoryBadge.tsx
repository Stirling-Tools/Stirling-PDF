import type { PolicyCategory } from "@app/policies/catalog";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@app/components/policies/PolicyCategoryBadge.css";

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
