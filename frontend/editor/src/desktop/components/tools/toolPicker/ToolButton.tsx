import { memo } from "react";
import CoreToolButton from "@core/components/tools/toolPicker/ToolButton";
import { getToolDisabledReason } from "@app/components/tools/fullscreen/shared";
import {
  useToolWorkflowActions,
  useToolWorkflowData,
} from "@app/contexts/ToolWorkflowContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";
import { useUnavailableToolFallback } from "@app/hooks/useUnavailableToolFallback";

type CoreToolButtonProps = React.ComponentProps<typeof CoreToolButton>;

/**
 * Desktop override of ToolButton.
 * In local mode, unavailable tools (except comingSoon/selfHostedOffline) navigate directly
 * to the tool UI — the execute button there shows the disabled state with a "click to sign in"
 * tooltip, keeping the tool's settings visible and letting the user explore before committing.
 * In selfhosted/saas mode the tool renders as visually unavailable (dimmed, no badge).
 */
const ToolButton: React.FC<CoreToolButtonProps> = (props) => {
  const { toolAvailability } = useToolWorkflowData();
  const { handleToolSelectForced } = useToolWorkflowActions();
  const { config } = useAppConfig();
  const localOnly = useLocalProcessingOnly();
  const premiumEnabled = config?.premiumEnabled;
  const unavailableFallback = useUnavailableToolFallback();

  const disabledReason = getToolDisabledReason(
    props.id,
    props.tool,
    toolAvailability,
    premiumEnabled,
  );

  // In local mode, pass a handler so CoreToolButton renders the tool as "cloud-available"
  // (full opacity, cloud badge, clickable). Clicking navigates to the tool normally so the
  // user can see the settings; the disabled execute button handles the sign-in prompt.
  // comingSoon and selfHostedOffline tools remain dimmed — they have no usable UI to show.
  const handleUnavailableClick =
    unavailableFallback &&
    disabledReason !== "comingSoon" &&
    disabledReason !== "selfHostedOffline"
      ? () => handleToolSelectForced(props.id)
      : undefined;

  if (localOnly && props.tool.hiddenFromToolList) return null;
  return (
    <CoreToolButton {...props} onUnavailableClick={handleUnavailableClick} />
  );
};

export default memo(ToolButton);
