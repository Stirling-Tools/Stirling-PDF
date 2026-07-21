import LocalIcon from "@app/components/shared/LocalIcon";
import type { FlowOutcomeKey } from "@portal/api/processorFlow";
import {
  EDITOR_TYPE,
  ICON_SIZE,
} from "@portal/components/processor-flow/flowTypes";

/** Real Material Symbols icon for a live source node, keyed off its `type`. */
export function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case EDITOR_TYPE:
      return <LocalIcon icon="edit-document" width={ICON_SIZE} />;
    case "s3":
      return <LocalIcon icon="cloud" width={ICON_SIZE} />;
    case "folder":
      return <LocalIcon icon="folder" width={ICON_SIZE} />;
    default:
      return <LocalIcon icon="database" width={ICON_SIZE} />;
  }
}

/** Real Material Symbols icon for an audit outcome node. Literal icon names
 *  (not a ternary) so the icon extractor bundles them. */
export function OutcomeIcon({ outcome }: { outcome: FlowOutcomeKey }) {
  if (outcome === "success")
    return <LocalIcon icon="check-circle" width={ICON_SIZE} />;
  return <LocalIcon icon="cancel" width={ICON_SIZE} />;
}
