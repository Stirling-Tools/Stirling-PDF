import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { CardRail, OptionCard } from "@editor/ui";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import {
  deserializeToolStep,
  getExecutableTools,
  newWorkingToolStep,
  serializeToolStep,
} from "@editor/hooks/tools/shared/toolAutomation";
import {
  useActivityChainText,
  useToolWorkflowSuggestions,
} from "@editor/hooks/useToolWorkflowSuggestions";
import type { PipelineView, Policy } from "@processor/api/pipelines";

const MAX_PIPELINE_SUGGESTIONS = 6;

interface ActivityPipelineSuggestionsProps {
  pipelines: PipelineView[];
  onOpen: (draft: Policy) => void;
}

export function ActivityPipelineSuggestions({
  pipelines,
  onOpen,
}: ActivityPipelineSuggestionsProps) {
  const { t } = useTranslation();
  const { allTools } = useToolRegistry();
  const { name, ranByShort } = useActivityChainText(allTools);
  const executableTools = useMemo(
    () => getExecutableTools(allTools),
    [allTools],
  );
  const executableRegistry = useMemo(
    () =>
      Object.fromEntries(
        executableTools.map(({ toolId }) => [toolId, allTools[toolId]]),
      ),
    [executableTools, allTools],
  );

  const existingOperationLists = useMemo(
    () =>
      pipelines.map((pipeline) =>
        pipeline.steps.map(
          (operation) =>
            deserializeToolStep({ operation, parameters: {} }, allTools)
              .toolId ?? operation,
        ),
      ),
    [pipelines, allTools],
  );
  const chains = useToolWorkflowSuggestions(
    executableRegistry,
    existingOperationLists,
    MAX_PIPELINE_SUGGESTIONS,
    "mostRun",
  );

  const suggestions = (chains ?? []).flatMap((chain) => {
    const tools = chain.operations.map((toolId) =>
      executableTools.find((entry) => entry.toolId === toolId),
    );
    if (!tools.every((tool) => tool !== undefined)) return [];
    const draft: Policy = {
      name: name(chain),
      enabled: true,
      inputs: [],
      steps: tools.map((tool) =>
        serializeToolStep(newWorkingToolStep(tool, allTools), allTools),
      ),
      output: { type: "inline", options: {} },
      outputIds: [],
    };
    return [{ chain, draft }];
  });

  if (suggestions.length === 0) return null;

  return (
    <section className="portal-pipelines__templates">
      <h2 className="portal-pipelines__section-title">
        {t("portal.pipelines.activity.title", "From how people work")}
      </h2>
      <CardRail itemWidth="16rem">
        {suggestions.map(({ chain, draft }) => (
          <OptionCard
            key={chain.operations.join("-")}
            icon={<Icon name="activity" size={"1.25rem"} />}
            title={
              <span
                title={name(chain)}
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  overflow: "hidden",
                }}
              >
                {name(chain)}
              </span>
            }
            description={ranByShort(chain)}
            onSelect={() => onOpen(draft)}
            cta={
              <>
                {t("portal.pipelines.activity.build", "Build pipeline")}
                <Icon name="arrow-right" size={"1rem"} />
              </>
            }
          />
        ))}
      </CardRail>
    </section>
  );
}
