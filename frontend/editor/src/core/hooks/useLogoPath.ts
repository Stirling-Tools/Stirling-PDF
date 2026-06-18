import { useMemo } from "react";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

/** Theme-specific no-text logo SVG URLs under the `logo` folder. */
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
