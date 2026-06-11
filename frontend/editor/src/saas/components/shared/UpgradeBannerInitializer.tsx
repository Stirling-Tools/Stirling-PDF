import { useEffect } from "react";
import { useBanner } from "@app/contexts/BannerContext";
import UpgradeBanner from "@app/components/shared/UpgradeBanner";
import { TeamInvitationBanner } from "@app/components/shared/TeamInvitationBanner";

/**
 * SaaS-web banner initializer. Shadows the proprietary initializer so the SaaS
 * build also surfaces the team invitation banner above the upgrade banner.
 */
export function UpgradeBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(
      <>
        <TeamInvitationBanner />
        <UpgradeBanner />
      </>,
    );
    return () => {
      setBanner(null);
    };
  }, [setBanner]);

  return null;
}
