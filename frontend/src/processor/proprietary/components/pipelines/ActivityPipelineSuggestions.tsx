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
import type { ActivityChain } from "@editor/utils/activityChains";
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
  const { name, ranBy } = useActivityChainText(allTools);

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
    allTools,
    existingOperationLists,
    MAX_PIPELINE_SUGGESTIONS,
    "mostRun",
  );

  const executableTools = useMemo(
    () => getExecutableTools(allTools),
    [allTools],
  );

  const toDraft = (chain: ActivityChain): Policy => ({
    name: name(chain),
    enabled: true,
    inputs: [],
    steps: chain.operations.flatMap((toolId) => {
      const tool = executableTools.find((entry) => entry.toolId === toolId);
      return tool
        ? [serializeToolStep(newWorkingToolStep(tool, allTools), allTools)]
        : [];
    }),
    output: { type: "inline", options: {} },
    outputIds: [],
  });

  if (!chains || chains.length === 0) return null;

  return (
    <section className="portal-pipelines__templates">
      <h2 className="portal-pipelines__section-title">
        {t("portal.pipelines.activity.title", "From how people work")}
      </h2>
      <CardRail itemWidth="16rem">
        {chains.map((chain) => (
          <OptionCard
            key={chain.operations.join("-")}
            icon={<Icon name="activity" size={"1.25rem"} />}
            title={name(chain)}
            description={ranBy(chain)}
            onSelect={() => onOpen(toDraft(chain))}
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
