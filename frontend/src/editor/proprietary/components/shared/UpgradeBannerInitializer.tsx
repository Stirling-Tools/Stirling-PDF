import { useEffect } from "react";
import { useBanner } from "@editor/contexts/BannerContext";
import UpgradeBanner from "@editor/components/shared/UpgradeBanner";
import { TeamWelcomeBanner } from "@editor/components/shared/TeamWelcomeBanner";

export function UpgradeBannerInitializer() {
  const { setBanner } = useBanner();

  useEffect(() => {
    setBanner(
      <>
        <TeamWelcomeBanner />
        <UpgradeBanner />
      </>,
    );
    return () => {
      setBanner(null);
    };
  }, [setBanner]);

  return null;
}
