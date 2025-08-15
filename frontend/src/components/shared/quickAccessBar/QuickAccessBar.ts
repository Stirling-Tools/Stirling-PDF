import { ButtonConfig } from '../../../types/sidebar';
import { useFlatToolRegistry } from '../../../data/toolRegistry';

// Border radius constants
export const ROUND_BORDER_RADIUS = '0.5rem';

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
 * Determine which nav button should be highlighted based on the tool registry.
 * Uses the tool's `view` property to map to the nav button id.
 */
export const getTargetNavButton = (
  selectedToolKey: string | null,
  registry: ReturnType<typeof useFlatToolRegistry>
): string | null => {
  if (!selectedToolKey) return null;

  const toolEntry = registry[selectedToolKey];
  if (!toolEntry) return null;

  // Use the tool's view as the nav button id
  return toolEntry.view || null;
};

/**
 * Determine the active nav button based on current tool state and registry
 */
export const getActiveNavButton = (
  leftPanelView: 'toolPicker' | 'toolContent',
  selectedToolKey: string | null,
  registry: ReturnType<typeof useFlatToolRegistry>
): string => {
  if (leftPanelView !== 'toolContent' || !selectedToolKey) {
    return 'tools';
  }

  return getTargetNavButton(selectedToolKey, registry) || 'tools';
};
