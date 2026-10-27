import { useEffect } from "react";
import { useBanner } from "@editor/contexts/BannerContext";
import UpgradeBanner from "@editor/components/shared/UpgradeBanner";

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
