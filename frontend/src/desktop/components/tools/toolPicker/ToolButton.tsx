import { useState, useEffect } from 'react';
import CoreToolButton from '@core/components/tools/toolPicker/ToolButton';
import { OPEN_SIGN_IN_EVENT } from '@app/constants/signInEvents';
import { getToolDisabledReason } from '@app/components/tools/fullscreen/shared';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { connectionModeService, type ConnectionMode } from '@app/services/connectionModeService';

type CoreToolButtonProps = React.ComponentProps<typeof CoreToolButton>;

/**
 * Desktop override of ToolButton.
 * Unavailable tools (except comingSoon) open the sign-in modal — but only in local mode.
 * In selfhosted/saas mode the tool is simply unavailable with no modal.
 */
const ToolButton: React.FC<CoreToolButtonProps> = (props) => {
  const { toolAvailability } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((cfg) => setConnectionMode(cfg.mode));
  }, []);

  const disabledReason = getToolDisabledReason(
    props.id as string,
    props.tool as ToolRegistryEntry,
    toolAvailability,
    premiumEnabled
  );

  // Only provide a click handler in local mode — this makes CoreToolButton show the cloud badge
  // and treat the tool as clickable. In selfhosted/saas mode the tool renders as visually
  // unavailable (dimmed, no badge) and clicking does nothing.
  // Note: DEPENDENCY-disabled tools in selfhosted mode are already treated as available by
  // useMultipleEndpointsEnabled, so they won't reach this path.
  const handleUnavailableClick = connectionMode === 'local' && disabledReason !== 'comingSoon'
    ? () => window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT))
    : undefined;

  return <CoreToolButton {...props} onUnavailableClick={handleUnavailableClick} />;
};

export default ToolButton;
