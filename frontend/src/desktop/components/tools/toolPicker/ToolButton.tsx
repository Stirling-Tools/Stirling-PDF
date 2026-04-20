import { useState, useEffect } from "react";
import CoreToolButton from "@core/components/tools/toolPicker/ToolButton";
import { getToolDisabledReason } from "@app/components/tools/fullscreen/shared";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

type CoreToolButtonProps = React.ComponentProps<typeof CoreToolButton>;

/**
 * Desktop override of ToolButton.
 * In local mode, unavailable tools (except comingSoon/selfHostedOffline) navigate directly
 * to the tool UI — the execute button there shows the disabled state with a "click to sign in"
 * tooltip, keeping the tool's settings visible and letting the user explore before committing.
 * In selfhosted/saas mode the tool renders as visually unavailable (dimmed, no badge).
 */
const ToolButton: React.FC<CoreToolButtonProps> = (props) => {
  const { toolAvailability, handleToolSelectForced } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(
    null,
  );

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setConnectionMode(cfg.mode),
    );
  }, []);

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
    connectionMode === "local" &&
    disabledReason !== "comingSoon" &&
    disabledReason !== "selfHostedOffline"
      ? () => handleToolSelectForced(props.id)
      : undefined;

  return (
    <CoreToolButton {...props} onUnavailableClick={handleUnavailableClick} />
  );
};

export default ToolButton;
