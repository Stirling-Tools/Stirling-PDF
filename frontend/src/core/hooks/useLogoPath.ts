import { useMemo } from "react";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

/**
 * Hook to get logo paths for both light and dark themes.
 * Use `.theme-img-light-only` / `.theme-img-dark-only` CSS classes to show the correct variant.
 *
 * Logo styles:
 * - classic: classic S logo stored in /classic-logo
 * - modern: minimalist logo stored in /modern-logo
 *
 * @returns Object with `dark` and `light` SVG paths
 */
export function useLogoPath(): { dark: string; light: string } {
  const { folderPath } = useLogoAssets();

  return useMemo(
    () => ({
      dark: `${folderPath}/StirlingPDFLogoNoTextDark.svg`,
      light: `${folderPath}/StirlingPDFLogoNoTextLight.svg`,
    }),
    [folderPath],
  );
}
