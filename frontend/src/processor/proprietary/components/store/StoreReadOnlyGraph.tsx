import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { NodeCard } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { useToolRegistry } from "@editor/contexts/ToolRegistryContext";
import type {
  StoreManifestStep,
  StoreRequiredOnInstall,
} from "@processor/api/store";
import {
  findToolForOperation,
  operationLabel,
  requiredFieldsForStep,
  settingsSummary,
} from "@processor/components/store/storeTools";
import "@processor/components/store/StoreReadOnlyGraph.css";

interface StoreReadOnlyGraphProps {
  steps: StoreManifestStep[];
  requiredOnInstall: StoreRequiredOnInstall[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/**
 * The listing's chain as a vertical column of node tiles: dashed placeholders for the source and
 * destination the installer supplies, and one selectable tile per step. Read-only by design; the
 * builder is where a copy gets edited.
 */
export function StoreReadOnlyGraph({
  steps,
  requiredOnInstall,
  selectedIndex,
  onSelect,
}: StoreReadOnlyGraphProps) {
  const { t } = useTranslation();
  const { allTools } = useToolRegistry();

  return (
    <div className="portal-store__graph">
      <NodeCard
        className="portal-store__node portal-store__node--placeholder"
        icon={<Icon name="inbox" size="1.125rem" />}
        iconAccent="green"
        title={t("portal.store.detail.yourSource")}
        detail={t("portal.store.detail.chosenOnInstall")}
      />
      <span className="portal-store__edge" aria-hidden />
      {steps.map((step, index) => {
        const hidden = requiredFieldsForStep(requiredOnInstall, index);
        const icon = findToolForOperation(step.operation, allTools)?.entry.icon;
        return (
          <Fragment key={`${step.operation}-${index}`}>
            <NodeCard
              className="portal-store__node"
              icon={icon ?? <Icon name="sliders-horizontal" size="1.125rem" />}
              iconAccent="blue"
              title={operationLabel(step.operation, allTools, t)}
              detail={
                settingsSummary(step.parameters, hidden) ||
                t("portal.store.detail.noSettings")
              }
              selected={selectedIndex === index}
              onSelect={() => onSelect(index)}
            />
            <span className="portal-store__edge" aria-hidden />
          </Fragment>
        );
      })}
      <NodeCard
        className="portal-store__node portal-store__node--placeholder"
        icon={<Icon name="send" size="1.125rem" />}
        iconAccent="purple"
        title={t("portal.store.detail.yourDestination")}
        detail={t("portal.store.detail.chosenOnInstall")}
      />
    </div>
  );
}
