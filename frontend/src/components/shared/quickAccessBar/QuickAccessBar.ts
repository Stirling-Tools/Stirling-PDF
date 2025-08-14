import { ButtonConfig } from '../../../types/sidebar';

// Border radius constants
export const ROUND_BORDER_RADIUS = '0.5rem';

/**
 * Get border radius for a button based on its configuration
 */
export const getNavButtonBorderRadius = (config: ButtonConfig): string => {
  return config.isRound ? ROUND_BORDER_RADIUS : ROUND_BORDER_RADIUS;
};

/**
 * Check if a navigation button is currently active
 */
export const isNavButtonActive = (
  config: ButtonConfig, 
  activeButton: string, 
  isFilesModalOpen: boolean, 
  configModalOpen: boolean
): boolean => {
  return (
    (config.type === 'navigation' && activeButton === config.id) ||
    (config.type === 'modal' && config.id === 'files' && isFilesModalOpen) ||
    (config.type === 'modal' && config.id === 'config' && configModalOpen)
  );
};

/**
 * Get button styles based on active state
 */
export const getNavButtonStyle = (
  config: ButtonConfig, 
  activeButton: string, 
  isFilesModalOpen: boolean, 
  configModalOpen: boolean
) => {
  const isActive = isNavButtonActive(config, activeButton, isFilesModalOpen, configModalOpen);

  if (isActive) {
    return {
      backgroundColor: `var(--icon-${config.id}-bg)`,
      color: `var(--icon-${config.id}-color)`,
      border: 'none',
      borderRadius: getNavButtonBorderRadius(config),
    };
  }

  // Inactive state for all buttons
  return {
    backgroundColor: 'var(--icon-inactive-bg)',
    color: 'var(--icon-inactive-color)',
    border: 'none',
    borderRadius: getNavButtonBorderRadius(config),
  };
};

/**
 * Determine which nav button should be highlighted based on selected tool
 */
export const getTargetNavButton = (selectedTool: any): string | null => {
  if (!selectedTool) return null;
  
  // Map tool.view to nav button ids
  if (selectedTool.view === 'sign') return 'sign';
  if (selectedTool.view === 'view') return 'read';
  // Use subcategory to infer Automate group
  if (selectedTool.subcategory === 'Automation') return 'automate';
  
  return null;
};
