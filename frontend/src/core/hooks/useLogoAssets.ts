import { useMemo } from 'react';
import { BASE_PATH } from '@app/constants/app';
import { getLogoFolder } from '@app/constants/logo';
import { useLogoVariant } from '@app/hooks/useLogoVariant';

export function useLogoAssets() {
  const logoVariant = useLogoVariant();

  return useMemo(() => {
    const folder = getLogoFolder(logoVariant);
    const folderPath = `${BASE_PATH}/${folder}`;

    return {
      logoVariant,
      folder,
      folderPath,
      getAssetPath: (name: string) => `${folderPath}/${name}`,
      tooltipLogo: `${folderPath}/logo-tooltip.svg`,
      firstPage: `${folderPath}/Firstpage.png`,
      favicon: `${folderPath}/favicon.ico`,
      logo192: `${folderPath}/logo192.png`,
      logo512: `${folderPath}/logo512.png`,
      wordmark: {
        white: `${folderPath}/StirlingPDFLogoWhiteText.svg`,
        black: `${folderPath}/StirlingPDFLogoBlackText.svg`,
        grey: `${folderPath}/StirlingPDFLogoGreyText.svg`,
      },
      manifestHref: logoVariant === 'classic'
        ? `${BASE_PATH}/manifest-classic.json`
        : `${BASE_PATH}/manifest.json`,
    };
  }, [logoVariant]);
}

