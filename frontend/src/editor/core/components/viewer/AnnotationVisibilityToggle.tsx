import { useTranslation } from "react-i18next";
import { BarButton } from "@editor/components/viewer/ViewerBarControls";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useSignature } from "@editor/contexts/SignatureContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import type { ToolId } from "@editor/types/toolId";

/**
 * Tools that place marks on the pages, which must stay visible meanwhile.
 * Annotate is left out: its panel disables its tools while annotations are
 * hidden, so this toggle is the way back.
 */
const DRAWING_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  "sign",
  "addImage",
  "addText",
]);

/** Shows or hides the document's annotations, in the viewer only. */
export function AnnotationVisibilityToggle({
  disabled,
  size,
}: {
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const { t } = useTranslation();
  const { isAnnotationsVisible, toggleAnnotationsVisibility } = useViewer();
  const { isPlacementMode } = useSignature();
  const { selectedTool } = useNavigationState();
  const label = t(
    "workbenchBar.toggleAnnotations",
    "Toggle Annotations Visibility",
  );
  return (
    <BarButton
      icon={isAnnotationsVisible ? "eye" : "eye-off"}
      label={label}
      iconOnly
      size={size}
      tooltipPosition="top"
      active={!isAnnotationsVisible}
      disabled={
        disabled ||
        isPlacementMode ||
        (selectedTool != null && DRAWING_TOOLS.has(selectedTool))
      }
      onClick={toggleAnnotationsVisibility}
      testId="viewer-annotation-visibility"
    />
  );
}
