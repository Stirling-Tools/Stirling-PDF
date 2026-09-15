import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Button } from "@app/ui";
import "@portal/components/pipelines/graph/GraphPlaceholderNode.css";

export interface GraphPlaceholderNodeProps {
  label: string;
  onAdd: () => void;
}

/**
 * The stand-in for a row the pipeline has not filled yet - the first step, or either end of the
 * chain on a new pipeline. It sits in the row that thing will occupy, so the chain reads as
 * input -> something -> output straight away, and it is the thing you click to fill it: a full-width
 * target, rather than a caption pointing at a small plus on a wire.
 */
export function GraphPlaceholderNode({
  label,
  onAdd,
}: GraphPlaceholderNodeProps) {
  return (
    <Button
      variant="quiet"
      className="portal-graph-placeholder"
      onClick={onAdd}
      leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
    >
      <span className="portal-graph-placeholder__title">{label}</span>
    </Button>
  );
}
