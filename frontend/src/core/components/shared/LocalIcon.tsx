import React from 'react';
import { addCollection, Icon } from '@iconify/react';
import iconSet from '../../../assets/material-symbols-icons.json'; // eslint-disable-line no-restricted-imports -- Outside app paths

// Load icons synchronously at import time - guaranteed to be ready on first render
let iconsLoaded = false;

try {
  if (iconSet) {
    addCollection(iconSet);
    iconsLoaded = true;
    const localIconCount = Object.keys(iconSet.icons || {}).length;
    console.info(`✅ Local icons loaded: ${localIconCount} icons (${Math.round(JSON.stringify(iconSet).length / 1024)}KB)`);
  }
} catch {
  console.info('ℹ️  Local icons not available - using CDN fallback');
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
export const LocalIcon: React.FC<LocalIconProps> = ({ icon, width, height, style, ...props }) => {
  // Convert our icon naming convention to the local collection format
  const iconName = icon.startsWith('material-symbols:')
    ? icon
    : `material-symbols:${icon}`;

  // Development logging (only in dev mode)
  if (process.env.NODE_ENV === 'development') {
    const logKey = `icon-${iconName}`;
    if (!sessionStorage.getItem(logKey)) {
      const source = iconsLoaded ? 'local' : 'CDN';
      console.debug(`🎯 Icon: ${iconName} (${source})`);
      sessionStorage.setItem(logKey, 'logged');
    }
  }

  const iconStyle: React.CSSProperties = { ...style };

  // Use width if provided, otherwise fall back to height
  const size = width || height;
  if (size && typeof size === 'string') {
    // If it's a CSS unit string (like '1.5rem'), use it as fontSize
    iconStyle.fontSize = size;
  } else if (typeof size === 'number') {
    // If it's a number, treat it as pixels
    iconStyle.fontSize = `${size}px`;
  }

  // Always render the icon - Iconify will use local if available, CDN if not
  return <Icon icon={iconName} style={iconStyle} {...props} />;
};

export default LocalIcon;
