import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import {
  getSubcategoryLabel,
  SUBCATEGORY_ORDER,
  type SubcategoryId,
} from "@app/data/toolsTaxonomy";
import { type ExecutableTool } from "@app/hooks/tools/shared/toolAutomation";

interface ToolPickerProps {
  tools: ExecutableTool[];
  onPick: (tool: ExecutableTool) => void;
  onClose: () => void;
}

/**
 * Type-to-filter, category-grouped tool picker for adding a step to a pipeline. Replaces the flat
 * wall of tool pills so the list stays usable as the tool count grows.
 */
export function ToolPicker({ tools, onPick, onClose }: ToolPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? tools.filter((tool) => tool.name.toLowerCase().includes(q))
      : tools;
    const byCategory = new Map<SubcategoryId, ExecutableTool[]>();
    for (const tool of matched) {
      const list = byCategory.get(tool.subcategoryId) ?? [];
      list.push(tool);
      byCategory.set(tool.subcategoryId, list);
    }
    return SUBCATEGORY_ORDER.filter((id) => byCategory.has(id)).map((id) => ({
      id,
      label: getSubcategoryLabel(t, id),
      tools: byCategory.get(id) ?? [],
    }));
  }, [tools, query, t]);

  return (
    <div
      className="portal-pipelines__picker"
      role="dialog"
      aria-label={t("portal.pipelines.builder.addStep")}
    >
      <div className="portal-pipelines__picker-search">
        <input
          autoFocus
          value={query}
          placeholder={t("portal.pipelines.builder.searchTools")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
      </div>
      <div className="portal-pipelines__picker-list">
        {groups.length === 0 ? (
          <p className="portal-pipelines__picker-empty">
            {t("portal.pipelines.builder.noToolMatches")}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="portal-pipelines__picker-group">
              <div className="portal-pipelines__picker-group-label">
                {group.label}
              </div>
              {group.tools.map((tool) => (
                <Button
                  key={tool.toolId}
                  variant="quiet"
                  justify="start"
                  fullWidth
                  className="portal-pipelines__picker-item"
                  onClick={() => onPick(tool)}
                  leftSection={
                    <span
                      className="portal-pipelines__picker-icon"
                      aria-hidden="true"
                    >
                      {tool.icon}
                    </span>
                  }
                >
                  <span className="portal-pipelines__picker-name">
                    {tool.name}
                  </span>
                </Button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
