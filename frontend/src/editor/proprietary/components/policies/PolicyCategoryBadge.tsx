import type { PolicyCategory } from "@app/policies/catalog";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@app/components/policies/PolicyCategoryBadge.css";

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
