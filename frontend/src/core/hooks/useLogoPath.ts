import { useMemo } from 'react';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { useMantineColorScheme } from '@mantine/core';
import { BASE_PATH } from '@app/constants/app';

/**
 * Hook to get the correct logo path based on app config (logo style) and theme (light/dark)
 *
 * Logo styles:
 * - classic: branding/old/favicon.svg (classic S logo - default)
 * - modern: StirlingPDFLogoNoText{Light|Dark}.svg (minimalist modern design)
 *
 * @returns The path to the appropriate logo SVG file
 */
export function useLogoPath(): string {
  const { config } = useAppConfig();
  const { colorScheme } = useMantineColorScheme();

  return useMemo(() => {
    const logoStyle = config?.logoStyle || 'classic';

    if (logoStyle === 'classic') {
      // Classic logo (old favicon) - same for both light and dark modes
      return `${BASE_PATH}/branding/old/favicon.svg`;
    }

    // Modern logo - different for light and dark modes
    const themeSuffix = colorScheme === 'dark' ? 'Dark' : 'Light';
    return `${BASE_PATH}/branding/StirlingPDFLogoNoText${themeSuffix}.svg`;
  }, [config?.logoStyle, colorScheme]);
}
