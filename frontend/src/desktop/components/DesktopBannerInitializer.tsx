import { useEffect } from 'react';
import { useBanner } from '@app/contexts/BannerContext';
import { DefaultAppBanner } from '@app/components/shared/DefaultAppBanner';
import UpgradeBanner from '@app/components/shared/UpgradeBanner';
import { TeamInvitationBanner } from '@app/components/shared/TeamInvitationBanner';

export function DesktopBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(
      <>
        <TeamInvitationBanner />
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
