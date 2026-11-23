/**
 * Holds the viewer's interactions paused for as long as the create tool is armed, so drawing a
 * field never also selects the text underneath.
 */
import { ViewerInteractionLock } from "@editor/components/viewer/ViewerInteractionLock";
import { useFormFill } from "@editor/tools/formFill/FormFillContext";

export function FormCreationInteractionLock() {
  const { mode, creationType } = useFormFill();
  return (
    <ViewerInteractionLock active={mode === "create" && creationType != null} />
  );
}
