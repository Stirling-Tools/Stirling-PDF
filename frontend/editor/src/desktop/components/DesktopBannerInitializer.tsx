import { useEffect } from "react";
import { useBanner } from "@app/contexts/BannerContext";
import { DefaultAppBanner } from "@app/components/shared/DefaultAppBanner";
import UpgradeBanner from "@app/components/shared/UpgradeBanner";
import { TeamInvitationBanner } from "@app/components/shared/TeamInvitationBanner";
import { SelfHostedOfflineBanner } from "@app/components/shared/SelfHostedOfflineBanner";

export function DesktopBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(
      <>
        <SelfHostedOfflineBanner />
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
