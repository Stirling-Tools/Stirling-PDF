import React from 'react';
import { addCollection, Icon } from '@iconify/react';
import iconSet from '../../../assets/material-symbols-icons.json'; // eslint-disable-line no-restricted-imports -- Outside app paths

// Load icons synchronously at import time - guaranteed to be ready on first render
let iconsLoaded = false;
let localIconCount = 0;
const availableIcons = new Set<string>();

try {
  if (iconSet) {
    addCollection(iconSet);
    iconsLoaded = true;
    localIconCount = Object.keys(iconSet.icons || {}).length;
    // Build set of available icon names for fast lookup
    Object.keys(iconSet.icons || {}).forEach(iconName => {
      availableIcons.add(iconName);
    });
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
  // Strip material-symbols: prefix if present to get the base icon name
  const baseIconName = icon.startsWith('material-symbols:')
    ? icon.replace('material-symbols:', '')
    : icon;

  // Convert to the full icon naming convention with prefix
  const iconName = `material-symbols:${baseIconName}`;

  // Runtime validation in development mode
  if (process.env.NODE_ENV === 'development') {
    if (iconsLoaded && !availableIcons.has(baseIconName)) {
      const errorKey = `icon-error-${baseIconName}`;

      // Only log each missing icon once per session
      if (!sessionStorage.getItem(errorKey)) {
        console.error(
          `❌ LocalIcon: Icon "${baseIconName}" not found in bundle!\n` +
          `   This icon will fall back to CDN (slower, external request).\n` +
          `   Run "npm run generate-icons" to add it to the bundle, or fix the icon name.\n` +
          `   Search available icons at: https://fonts.google.com/icons`
        );
        sessionStorage.setItem(errorKey, 'logged');

        // Also throw error in development to make it more visible
        throw new Error(
          `LocalIcon: Missing icon "${baseIconName}". ` +
          `Run "npm run generate-icons" to update the bundle.`
        );
      }
    }

    // Development logging for successful icon loads
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
