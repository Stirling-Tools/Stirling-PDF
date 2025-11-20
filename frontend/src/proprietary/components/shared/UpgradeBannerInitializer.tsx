import { useEffect } from 'react';
import { useBanner } from '@app/contexts/BannerContext';
import UpgradeBanner from '@app/components/shared/UpgradeBanner';

export function UpgradeBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(<UpgradeBanner />);
    return () => {
      setBanner(null);
    };
  }, [setBanner]);

  return null;
}

