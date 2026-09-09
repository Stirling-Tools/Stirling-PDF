import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { NodeCard } from "@app/ui";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import type {
  StoreManifestStep,
  StoreRequiredOnInstall,
} from "@portal/api/store";
import {
  findToolForOperation,
  operationLabel,
  requiredFieldsForStep,
  settingsSummary,
} from "@portal/components/store/storeTools";
import "@portal/components/store/StoreReadOnlyGraph.css";

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
        icon={<MoveToInboxRoundedIcon style={{ fontSize: "1.125rem" }} />}
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
              icon={
                icon ?? <TuneRoundedIcon style={{ fontSize: "1.125rem" }} />
              }
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
        icon={<SendRoundedIcon style={{ fontSize: "1.125rem" }} />}
        iconAccent="purple"
        title={t("portal.store.detail.yourDestination")}
        detail={t("portal.store.detail.chosenOnInstall")}
      />
    </div>
  );
}
