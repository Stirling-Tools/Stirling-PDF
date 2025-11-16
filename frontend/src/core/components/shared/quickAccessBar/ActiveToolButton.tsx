/**
 * ActiveToolButton - Shows the currently selected tool at the top of the Quick Access Bar
 *
 * When a user selects a tool from the Tools list, this component displays the tool's
 * icon and name at the top of the navigation bar. It provides a quick way to see which
 * tool is currently active and offers a back button to return to the Tools list.
 *
 * Features:
 * - Shows tool icon and name when a tool is selected
 * - Hover to reveal back arrow for returning to Tools
 * - Smooth slide-down/slide-up animations
 * - Only appears for tools that don't have dedicated nav buttons (read, sign, automate)
 */

import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon } from '@mantine/core';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useSidebarNavigation } from '@app/hooks/useSidebarNavigation';
import { handleUnlessSpecialClick } from '@app/utils/clickHandlers';
import FitText from '@app/components/shared/FitText';
import { Tooltip } from '@app/components/shared/Tooltip';

interface ActiveToolButtonProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const NAV_IDS = ['read', 'sign', 'automate'];

const ActiveToolButton: React.FC<ActiveToolButtonProps> = ({ setActiveButton }) => {
  const { selectedTool, selectedToolKey, leftPanelView, handleBackToTools } = useToolWorkflow();
  const { getHomeNavigation } = useSidebarNavigation();

  // Determine if the indicator should be visible (do not require selectedTool to be resolved yet)
  // Special case: multiTool should always show even when sidebars are hidden
  const indicatorShouldShow = Boolean(
    selectedToolKey &&
    ((leftPanelView === 'toolContent' && !NAV_IDS.includes(selectedToolKey)) ||
     selectedToolKey === 'multiTool')
  );

  // Local animation and hover state
  const [indicatorTool, setIndicatorTool] = useState<typeof selectedTool | null>(null);
  const [indicatorVisible, setIndicatorVisible] = useState<boolean>(false);
  const [replayAnim, setReplayAnim] = useState<boolean>(false);
  const [isBackHover, setIsBackHover] = useState<boolean>(false);
  const prevKeyRef = useRef<string | null>(null);
  const collapseTimeoutRef = useRef<number | null>(null);
  const animTimeoutRef = useRef<number | null>(null);
  const replayRafRef = useRef<number | null>(null);

  const isSwitchingToNewTool = () => { return prevKeyRef.current && prevKeyRef.current !== selectedToolKey; };

  const clearTimers = () => {
    if (collapseTimeoutRef.current) {
      window.clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
  };

  const playGrowDown = () => {
    clearTimers();
    setIndicatorTool(selectedTool);
    setIndicatorVisible(true);
    // Force a replay even if the class is already applied
    setReplayAnim(false);
    if (replayRafRef.current) {
      cancelAnimationFrame(replayRafRef.current);
      replayRafRef.current = null;
    }
    replayRafRef.current = requestAnimationFrame(() => {
      setReplayAnim(true);
    });
    prevKeyRef.current = (selectedToolKey as string) || null;
    animTimeoutRef.current = window.setTimeout(() => {
      setReplayAnim(false);
      animTimeoutRef.current = null;
    }, 500);
  };

  const firstShow = () => {
    clearTimers();
    setIndicatorTool(selectedTool);
    setIndicatorVisible(true);
    prevKeyRef.current = (selectedToolKey as string) || null;
    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
    }, 500);
  };

  const triggerCollapse = () => {
    clearTimers();
    setIndicatorVisible(false);
    collapseTimeoutRef.current = window.setTimeout(() => {
      setIndicatorTool(null);
      prevKeyRef.current = null;
      collapseTimeoutRef.current = null;
    }, 500); // match CSS transition duration
  };

  useEffect(() => {
    if (indicatorShouldShow) {
      clearTimers();
      if (!indicatorVisible) {
        firstShow();
        return;
      }
      if (!indicatorTool) {
        firstShow();
      } else if (isSwitchingToNewTool()) {
        playGrowDown();
      } else {
        // keep reference in sync
        prevKeyRef.current = (selectedToolKey as string) || null;
      }
    } else if (indicatorTool || indicatorVisible) {
      triggerCollapse();
    }
  }, [indicatorShouldShow, selectedTool, selectedToolKey]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (replayRafRef.current) {
        cancelAnimationFrame(replayRafRef.current);
        replayRafRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div style={{ overflow: 'visible' }} className={`current-tool-slot ${indicatorVisible ? 'visible' : ''} ${replayAnim ? 'replay' : ''}`}>
        {indicatorTool && (
          <div className="current-tool-content">
            <div className="flex flex-col items-center gap-1">
              <Tooltip content={isBackHover ? 'Back to all tools' : indicatorTool.name} position="right" arrow maxWidth={140}>
                <ActionIcon
                  component="a"
                  href={getHomeNavigation().href}
                  onClick={(e: React.MouseEvent) => {
                    handleUnlessSpecialClick(e, () => {
                      setActiveButton('tools');
                      handleBackToTools();
                    });
                  }}
                  size={'lg'}
                  variant="subtle"
                  onMouseEnter={() => setIsBackHover(true)}
                  onMouseLeave={() => setIsBackHover(false)}
                  aria-label={isBackHover ? 'Back to all tools' : indicatorTool.name}
                  style={{
                    backgroundColor: isBackHover ? 'var(--color-gray-300)' : 'var(--icon-tools-bg)',
                    color: isBackHover ? '#fff' : 'var(--icon-tools-color)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textDecoration: 'none'
                  }}
                >
                  <span className="iconContainer">
                    {isBackHover ? (
                      <ArrowBackRoundedIcon sx={{ fontSize: '1.875rem' }} />
                    ) : (
                      indicatorTool.icon
                    )}
                  </span>
                </ActionIcon>
              </Tooltip>
              <FitText
                as="span"
                text={indicatorTool.name}
                lines={3}
                minimumFontScale={0.4}
                className="button-text active current-tool-label"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ActiveToolButton;


