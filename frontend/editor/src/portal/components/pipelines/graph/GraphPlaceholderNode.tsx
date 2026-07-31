import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button } from "@app/ui";
import "@portal/components/pipelines/graph/GraphPlaceholderNode.css";

export interface GraphPlaceholderNodeProps {
  onAdd: () => void;
}

/**
 * The stand-in shown while a pipeline has no steps. It sits in the row the first step will occupy,
 * so the chain reads as input -> something -> output straight away, and it is the thing you click
 * to add that step - a full-width target, rather than a caption pointing at a small plus on a wire.
 */
export function GraphPlaceholderNode({ onAdd }: GraphPlaceholderNodeProps) {
  const { t } = useTranslation();
  return (
    <Button
      variant="quiet"
      className="portal-graph-placeholder"
      onClick={onAdd}
      leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
    >
      <span className="portal-graph-placeholder__title">
        {t("portal.pipelines.graph.addFirstTool")}
      </span>
    </Button>
  );
}
