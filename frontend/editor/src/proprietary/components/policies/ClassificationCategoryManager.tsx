// Uber-simple category visibility list for the Files sidebar. Categories are the fixed, shared set
// (the built-in label families) — they can't be created, renamed, re-grouped, or have their labels
// edited. The only choice is showing or hiding each one in this device's sidebar; a hidden category
// forms no group, so its files fall to "Other".

import { useTranslation } from "react-i18next";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { ActionIcon } from "@app/ui/ActionIcon";
import { LocalIcon } from "@app/components/shared/LocalIcon";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";
import "@app/components/policies/ClassificationCategoryManager.css";

interface ClassificationCategoryManagerProps {
  categories: SidebarCategory[];
  onToggleHidden: (id: string, hidden: boolean) => void;
  /** Optional per-category file counts. */
  counts?: Map<string, number>;
}

export function ClassificationCategoryManager({
  categories,
  onToggleHidden,
  counts,
}: ClassificationCategoryManagerProps) {
  const { t } = useTranslation();
  return (
    <ul className="category-visibility">
      {categories.map((category) => {
        const count = counts?.get(category.id);
        return (
          <li
            key={category.id}
            className={
              category.hidden
                ? "category-visibility-row category-visibility-row--hidden"
                : "category-visibility-row"
            }
          >
            <span className="category-visibility-icon">
              <LocalIcon icon={category.icon} width="1.1rem" />
            </span>
            <span className="category-visibility-name">{category.name}</span>
            {count !== undefined && (
              <span className="category-visibility-count">{count}</span>
            )}
            <ActionIcon
              variant="quiet"
              aria-pressed={!category.hidden}
              aria-label={
                category.hidden
                  ? t("policies.labels.showCategory", "Show category")
                  : t("policies.labels.hideCategory", "Hide category")
              }
              onClick={() => onToggleHidden(category.id, !category.hidden)}
            >
              {category.hidden ? (
                <VisibilityOffIcon sx={{ fontSize: "1.1rem" }} />
              ) : (
                <VisibilityIcon sx={{ fontSize: "1.1rem" }} />
              )}
            </ActionIcon>
          </li>
        );
      })}
    </ul>
  );
}
