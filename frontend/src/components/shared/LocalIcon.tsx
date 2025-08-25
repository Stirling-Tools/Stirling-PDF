import React from 'react';
import { addCollection, Icon } from '@iconify/react';

// Try to import the icon set - it will be auto-generated
let iconSet: any = null;
let iconsLoaded = false;

try {
  iconSet = require('../../assets/material-symbols-icons.json');
  if (!iconsLoaded && iconSet) {
    addCollection(iconSet);
    iconsLoaded = true;
  }
} catch (error) {
  console.warn('Local icon set not found. Run `npm run generate-icons` to create it.');
}

interface LocalIconProps {
  icon: string;
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * LocalIcon component that uses our locally bundled Material Symbols icons
 * instead of loading from CDN
 */
export const LocalIcon: React.FC<LocalIconProps> = ({ icon, ...props }) => {
  // Convert our icon naming convention to the local collection format
  const iconName = icon.startsWith('material-symbols:') 
    ? icon 
    : `material-symbols:${icon}`;
  
  // Fallback if icons haven't been loaded yet
  if (!iconsLoaded || !iconSet) {
    return <span style={{ display: 'inline-block', width: props.width || 24, height: props.height || 24 }} />;
  }
  
  return <Icon icon={iconName} {...props} />;
};

export default LocalIcon;