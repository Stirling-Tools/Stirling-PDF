import { useMemo } from 'react';
import { useMantineColorScheme } from '@mantine/core';
import { useLogoAssets } from '@app/hooks/useLogoAssets';

/**
 * Hook to get the correct logo path based on app config (logo style) and theme (light/dark)
 *
 * Logo styles:
 * - classic: classic S logo stored in /classic-logo
 * - modern: minimalist logo stored in /modern-logo
 *
 * @returns The path to the appropriate logo SVG file
 */
export function useLogoPath(): string {
  const { colorScheme } = useMantineColorScheme();
  const { folderPath } = useLogoAssets();

  return useMemo(() => {
    const themeSuffix = colorScheme === 'dark' ? 'Dark' : 'Light';
    return `${folderPath}/StirlingPDFLogoNoText${themeSuffix}.svg`;
  }, [colorScheme, folderPath]);
}
