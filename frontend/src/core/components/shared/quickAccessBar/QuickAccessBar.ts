import { ButtonConfig } from '@app/types/sidebar';

// Border radius constants
export const ROUND_BORDER_RADIUS = '0.5rem';

/**
 * Check if a navigation button is currently active
 */
export const isNavButtonActive = (
  config: ButtonConfig,
  activeButton: string,
  isFilesModalOpen: boolean,
  configModalOpen: boolean,
  selectedToolKey?: string | null,
  leftPanelView?: 'toolPicker' | 'toolContent' | 'hidden'
): boolean => {
  const isActiveByLocalState = config.type === 'navigation' && activeButton === config.id;
  const isActiveByContext =
    config.type === 'navigation' &&
    leftPanelView === 'toolContent' &&
    selectedToolKey === config.id;
  const isActiveByModal =
    (config.type === 'modal' && config.id === 'files' && isFilesModalOpen) ||
    (config.type === 'modal' && config.id === 'config' && configModalOpen);

  return isActiveByLocalState || isActiveByContext || isActiveByModal;
};

/**
 * Get button styles based on active state
 */
export const getNavButtonStyle = (
  config: ButtonConfig,
  activeButton: string,
  isFilesModalOpen: boolean,
  configModalOpen: boolean,
  selectedToolKey?: string | null,
  leftPanelView?: 'toolPicker' | 'toolContent' | 'hidden'
) => {
  const isActive = isNavButtonActive(
    config,
    activeButton,
    isFilesModalOpen,
    configModalOpen,
    selectedToolKey,
    leftPanelView
  );

  if (isActive) {
    return {
      backgroundColor: `var(--icon-${config.id}-bg)`,
      color: `var(--icon-${config.id}-color)`,
      border: 'none',
      borderRadius: ROUND_BORDER_RADIUS,
    };
  }

  // Inactive state for all buttons
  return {
    backgroundColor: 'var(--icon-inactive-bg)',
    color: 'var(--icon-inactive-color)',
    border: 'none',
    borderRadius: ROUND_BORDER_RADIUS,
  };
};


/**
 * Determine the active nav button based on current tool state and registry
 */
export const getActiveNavButton = (
  selectedToolKey: string | null,
  readerMode: boolean
): string => {
  // Reader mode takes precedence and should highlight the Read nav item
  if (readerMode) {
    return 'read';
  }
  // If a tool is selected, highlight it immediately even if the panel view
  // transition to 'toolContent' has not completed yet. This prevents a brief
  // period of no-highlight during rapid navigation.
    return selectedToolKey ? selectedToolKey : 'tools';
};
