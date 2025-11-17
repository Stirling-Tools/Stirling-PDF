import { useEffect } from 'react';
import { useBanner } from '@app/contexts/BannerContext';
import { DefaultAppBanner } from '@app/components/shared/DefaultAppBanner';

export function DesktopBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(<DefaultAppBanner />);
  }, [setBanner]);

  return null;
}
