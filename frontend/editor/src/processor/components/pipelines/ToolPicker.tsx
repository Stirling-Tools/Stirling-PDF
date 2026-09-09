import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { Button, Input } from "@app/ui";
import {
  getSubcategoryLabel,
  SUBCATEGORY_ORDER,
  type SubcategoryId,
} from "@app/data/toolsTaxonomy";
import { type ExecutableTool } from "@app/hooks/tools/shared/toolAutomation";
import { toolAcceptsFormat } from "@app/utils/toolIOCompat";
import { getToolFormatLabel } from "@app/utils/toolIOLabels";
import { type ToolFormat } from "@app/types/toolIO";
import {
  searchOperations,
  type StepOperation,
} from "@processor/components/policies/stepOperations";
import { BrandMark } from "@processor/components/BrandMarks";

interface ToolPickerProps {
  tools: ExecutableTool[];
  onPick: (tool: ExecutableTool) => void;
  onClose: () => void;
  /**
   * Catalogue operations that hand the document to an outside system. Kept apart from the tool
   * groups because they are a different species - a tool transforms the document in place, these
   * call somebody else - and grouping them under a tool subcategory would bury that.
   */
  operations?: StepOperation[];
  onPickOperation?: (operation: StepOperation) => void;
  /**
   * What the step before this one produces, when known. Tools that cannot run on it are marked
   * rather than hidden: the chain is still editable in any order, and the builder explains the
   * problem once the step is added.
   */
  precedingOutput?: ToolFormat;
}

/**
 * Type-to-filter, category-grouped tool picker for adding a step to a pipeline. Replaces the flat
 * wall of tool pills so the list stays usable as the tool count grows.
 */
export function ToolPicker({
  tools,
  onPick,
  onClose,
  operations = [],
  onPickOperation,
  precedingOutput,
}: ToolPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  // A format-routed tool (convert) can follow the previous step if ANY endpoint in its routing set
  // accepts that output; a single-endpoint tool is judged on its one endpoint. Unknown when there
  // is no preceding output yet.
  const acceptsPreceding = (tool: ExecutableTool): boolean => {
    if (!precedingOutput) return true;
    const endpoints =
      tool.endpoints && tool.endpoints.length > 0
        ? tool.endpoints
        : [tool.endpoint];
    return endpoints.some((endpoint) =>
      toolAcceptsFormat(endpoint, precedingOutput),
    );
  };

  const matchedOperations = useMemo(
    () =>
      onPickOperation
        ? searchOperations(operations, query, (key) => t(key))
        : [],
    [operations, onPickOperation, query, t],
  );

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
    <div className="processor-pipelines__picker">
      <div className="processor-pipelines__picker-search">
        <Input
          autoFocus
          inputSize="sm"
          value={query}
          aria-label={t("processor.pipelines.builder.searchTools")}
          placeholder={t("processor.pipelines.builder.searchTools")}
          leadingIcon={<SearchRoundedIcon style={{ fontSize: "1.125rem" }} />}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
      </div>
      <div className="processor-pipelines__picker-list">
        {groups.length === 0 && matchedOperations.length === 0 ? (
          <p className="processor-pipelines__picker-empty">
            {t("processor.pipelines.builder.noToolMatches")}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="processor-pipelines__picker-group">
              <div className="processor-pipelines__picker-group-label">
                {group.label}
              </div>
              {group.tools.map((tool) => {
                const incompatible = Boolean(
                  precedingOutput && !acceptsPreceding(tool),
                );
                return (
                  <Button
                    key={tool.toolId}
                    variant="quiet"
                    justify="start"
                    fullWidth
                    className={[
                      "processor-pipelines__picker-item",
                      incompatible ? "is-incompatible" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => onPick(tool)}
                    leftSection={
                      <span
                        className="processor-pipelines__picker-icon"
                        aria-hidden="true"
                      >
                        {tool.icon}
                      </span>
                    }
                  >
                    <span className="processor-pipelines__picker-text">
                      <span className="processor-pipelines__picker-name">
                        {tool.name}
                      </span>
                      {incompatible && precedingOutput && (
                        <span className="processor-pipelines__picker-note">
                          {t("processor.pipelines.builder.cannotFollow", {
                            produced: getToolFormatLabel(t, precedingOutput),
                          })}
                        </span>
                      )}
                    </span>
                  </Button>
                );
              })}
            </div>
          ))
        )}

        {matchedOperations.length > 0 && onPickOperation ? (
          <div className="processor-pipelines__picker-group">
            <div className="processor-pipelines__picker-group-label">
              {t("processor.pipelines.builder.sendToSystem")}
            </div>
            {matchedOperations.map((op) => (
              <Button
                key={op.id}
                variant="quiet"
                justify="start"
                fullWidth
                className="processor-pipelines__picker-item"
                onClick={() => onPickOperation(op)}
                leftSection={
                  <span
                    className="processor-pipelines__picker-icon"
                    aria-hidden="true"
                  >
                    <BrandMark
                      id={op.custom ? "api" : op.connectionTypeId}
                      size={17}
                    />
                  </span>
                }
              >
                <span className="processor-pipelines__picker-name">
                  {t(op.labelKey)}
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
