import type { PolicyCategory } from "@editor/policies/catalog";
import { policyCategoryIcon } from "@editor/components/policies/policyCategoryIcon";
import "@editor/components/policies/PolicyCategoryBadge.css";

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
