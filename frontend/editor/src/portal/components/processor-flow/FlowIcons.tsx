import { Icon } from "@app/ui/Icon";
import type { FlowOutcomeKey } from "@portal/api/processorFlow";
import {
  EDITOR_TYPE,
  ICON_SIZE,
} from "@portal/components/processor-flow/flowTypes";

/** Icon for a live source node, keyed off its `type`. */
export function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case EDITOR_TYPE:
      return <Icon name="file-pen" size={ICON_SIZE} />;
    case "s3":
      return <Icon name="cloud" size={ICON_SIZE} />;
    case "folder":
      return <Icon name="folder" size={ICON_SIZE} />;
    default:
      return <Icon name="database" size={ICON_SIZE} />;
  }
}

/** Icon for an audit outcome node. */
export function OutcomeIcon({ outcome }: { outcome: FlowOutcomeKey }) {
  if (outcome === "success")
    return <Icon name="circle-check" size={ICON_SIZE} />;
  return <Icon name="circle-x" size={ICON_SIZE} />;
}
