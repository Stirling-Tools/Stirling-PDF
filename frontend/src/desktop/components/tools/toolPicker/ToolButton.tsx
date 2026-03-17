import CoreToolButton from '@core/components/tools/toolPicker/ToolButton';
import { OPEN_SIGN_IN_EVENT } from '@app/components/SignInModal';
import { getToolDisabledReason } from '@app/components/tools/fullscreen/shared';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { ToolId } from '@app/types/toolId';
import { ToolRegistryEntry } from '@app/data/toolsTaxonomy';

type CoreToolButtonProps = React.ComponentProps<typeof CoreToolButton>;

/**
 * Desktop override of ToolButton.
 * Unavailable tools (except comingSoon) open the sign-in modal instead of doing nothing.
 */
const ToolButton: React.FC<CoreToolButtonProps> = (props) => {
  const { toolAvailability } = useToolWorkflow();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  const disabledReason = getToolDisabledReason(
    props.id as string,
    props.tool as ToolRegistryEntry,
    toolAvailability,
    premiumEnabled
  );

  const handleUnavailableClick = () => {
    if (disabledReason !== 'comingSoon') {
      window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
    }
  };

  return <CoreToolButton {...props} onUnavailableClick={handleUnavailableClick} />;
};

export default ToolButton;
