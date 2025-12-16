import React from 'react';
import { ActionIcon } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import LocalIcon from '@app/components/shared/LocalIcon';
import { Tooltip } from '@app/components/shared/Tooltip';
import { ViewerContext } from '@app/contexts/ViewerContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { useSidebarContext } from '@app/contexts/SidebarContext';
import { useRightRailTooltipSide } from '@app/hooks/useRightRailTooltipSide';

interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
}

export default function ViewerAnnotationControls({ currentView, disabled = false }: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { sidebarRefs } = useSidebarContext();
  const { position: tooltipPosition, offset: tooltipOffset } = useRightRailTooltipSide(sidebarRefs);

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Check if we're in sign mode
  const { selectedTool } = useNavigationState();
  const isSignMode = selectedTool === 'sign';

  // Don't show any annotation controls in sign mode
  if (isSignMode) {
    return null;
  }

  return (
    <>
      {/* Annotation Visibility Toggle */}
      <Tooltip content={t('rightRail.toggleAnnotations', 'Toggle Annotations Visibility')} position={tooltipPosition} offset={tooltipOffset} arrow portalTarget={document.body}>
        <ActionIcon
          variant="subtle"
          radius="md"
          className="right-rail-icon"
          onClick={() => {
            viewerContext?.toggleAnnotationsVisibility();
          }}
          disabled={disabled || currentView !== 'viewer'}
        >
          <LocalIcon
            icon={viewerContext?.isAnnotationsVisible ? "visibility" : "visibility-off-rounded"}
            width="1.5rem"
            height="1.5rem"
          />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
