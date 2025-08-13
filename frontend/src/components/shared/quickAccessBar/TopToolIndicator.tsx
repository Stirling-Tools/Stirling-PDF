import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ActionIcon, Divider, useMantineColorScheme } from '@mantine/core';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { useToolWorkflow } from '../../../contexts/ToolWorkflowContext';
import FitText from '../FitText';
import { Tooltip } from '../Tooltip';
import { getSubcategoryColor } from '../../../data/toolRegistry';

interface TopToolIndicatorProps {
  activeButton: string;
  setActiveButton: (id: string) => void;
}

const NAV_IDS = ['read','sign','automate','files','activity','config'];

const TopToolIndicator: React.FC<TopToolIndicatorProps> = ({ activeButton, setActiveButton }) => {
  const { selectedTool, selectedToolKey, leftPanelView, handleBackToTools } = useToolWorkflow();
  const { colorScheme } = useMantineColorScheme();

  // Determine if the indicator should be visible
  const indicatorShouldShow = Boolean(
    selectedToolKey && selectedTool && activeButton === 'tools' && leftPanelView === 'toolContent' && !NAV_IDS.includes(selectedToolKey)
  );

  // Local animation and hover state
  const [indicatorTool, setIndicatorTool] = useState<typeof selectedTool | null>(null);
  const [indicatorVisible, setIndicatorVisible] = useState<boolean>(false);
  const [replayAnim, setReplayAnim] = useState<boolean>(false);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isBackHover, setIsBackHover] = useState<boolean>(false);
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (indicatorShouldShow) {
      // If switching to a different tool while visible, replay the grow down
      if (prevKeyRef.current && prevKeyRef.current !== selectedToolKey) {
        setIndicatorTool(selectedTool);
        setIndicatorVisible(true);
        setReplayAnim(true);
        setIsAnimating(true);
        const t = window.setTimeout(() => {
          setReplayAnim(false);
          setIsAnimating(false);
        }, 500);
        return () => window.clearTimeout(t);
      }
      // First show
      setIndicatorTool(selectedTool);
      setIndicatorVisible(true);
      setIsAnimating(true);
      prevKeyRef.current = (selectedToolKey as string) || null;
      const tShow = window.setTimeout(() => setIsAnimating(false), 500);
      return () => window.clearTimeout(tShow);
    } else if (indicatorTool) {
      // trigger collapse
      setIndicatorVisible(false);
      setIsAnimating(true);
      const timeout = window.setTimeout(() => {
        setIndicatorTool(null);
        prevKeyRef.current = null;
        setIsAnimating(false);
      }, 500); // match CSS transition duration
      return () => window.clearTimeout(timeout);
    }
  }, [indicatorShouldShow, selectedTool, selectedToolKey]);

  const lightModeBg = useMemo(() => {
    if (!indicatorTool) return undefined;
    return getSubcategoryColor(indicatorTool.subcategory || undefined);
  }, [indicatorTool]);

  return (
    <>
      <div style={{overflow:'visible'}} className={`current-tool-slot ${indicatorVisible ? 'visible' : ''} ${replayAnim ? 'replay' : ''}`}>
        {indicatorTool && (
          <div className="current-tool-content">
            <div className="flex flex-col items-center gap-1">
              <Tooltip content={isBackHover ? 'Back to all tools' : indicatorTool.name} position="right" arrow maxWidth={140}>
                <ActionIcon
                  size={'xl'}
                  variant="subtle"
                  onMouseEnter={() => setIsBackHover(true)}
                  onMouseLeave={() => setIsBackHover(false)}
                  onClick={() => {
                    setActiveButton('tools');
                    handleBackToTools();
                  }}
                  aria-label={isBackHover ? 'Back to all tools' : indicatorTool.name}
                  style={{
                    backgroundColor: isBackHover
                      ? '#9CA3AF'
                      : (colorScheme === 'light' ? lightModeBg : 'var(--icon-tools-bg)'),
                    color: isBackHover
                      ? '#fff'
                      : (colorScheme === 'light' ? '#fff' : 'var(--icon-tools-color)'),
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <span className="iconContainer">
                    {isBackHover ? (
                      <ArrowBackRoundedIcon sx={{ fontSize: '1.5rem' }} />
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
      {(indicatorTool && !isAnimating) && (
        <Divider size="xs" className="current-tool-divider" />
      )}
    </>
  );
};

export default TopToolIndicator;


