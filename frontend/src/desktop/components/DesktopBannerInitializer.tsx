import { useEffect } from 'react';
import { useBanner } from '@app/contexts/BannerContext';
import { DefaultAppBanner } from '@app/components/shared/DefaultAppBanner';
import UpgradeBanner from '@app/components/shared/UpgradeBanner';

export function DesktopBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(
      <>
        <UpgradeBanner />
        <DefaultAppBanner />
      </>,
    );
    return () => {
      setBanner(null);
    };
  }, [setBanner]);

  return null;
}
