import { useMemo } from "react";
import { BASE_PATH } from "@app/constants/app";

const LOGO_FOLDER = "logo";

export function useLogoAssets() {
  return useMemo(() => {
    const folderPath = `${BASE_PATH}/${LOGO_FOLDER}`;

    return {
      folderPath,
      getAssetPath: (name: string) => `${folderPath}/${name}`,
      wordmark: {
        black: `${folderPath}/StirlingPDFLogoBlackText.svg`,
        grey: `${folderPath}/StirlingPDFLogoGreyText.svg`,
        white: `${folderPath}/StirlingPDFLogoWhiteText.svg`,
      },
      tooltipLogo: `${folderPath}/logo-tooltip.svg`,
      firstPage: `${folderPath}/Firstpage.png`,
      favicon: `${folderPath}/favicon.ico`,
      logo192: `${folderPath}/logo192.png`,
      logo512: `${folderPath}/logo512.png`,
      manifestHref: `${BASE_PATH}/manifest.json`,
    };
  }, []);
}
