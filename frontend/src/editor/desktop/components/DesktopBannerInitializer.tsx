import { useEffect } from "react";
import { useBanner } from "@editor/contexts/BannerContext";
import { DefaultAppBanner } from "@editor/components/shared/DefaultAppBanner";
import UpgradeBanner from "@editor/components/shared/UpgradeBanner";
import { TeamInvitationBanner } from "@editor/components/shared/TeamInvitationBanner";
import { SelfHostedOfflineBanner } from "@editor/components/shared/SelfHostedOfflineBanner";

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
