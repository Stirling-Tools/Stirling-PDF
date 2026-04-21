import { useEffect, useState } from "react";
import { SidebarRefs } from "@app/types/sidebar";

export function useRightRailTooltipSide(
  sidebarRefs?: SidebarRefs,
  defaultOffset: number = 16,
): { position: "left" | "right" | "bottom"; offset: number } {
  const [position, setPosition] = useState<"left" | "right" | "bottom">(
    "bottom",
  );

  useEffect(() => {
    const computePosition = () => {
      const rail = sidebarRefs?.rightRailRef?.current;
      const isRTL =
        typeof document !== "undefined" &&
        document.documentElement.dir === "rtl";

      // No rail visible — buttons are in the top bar, tooltips should point down
      if (!rail || typeof window === "undefined") {
        setPosition("bottom");
        return;
      }

      const rect = rail.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const preferred = center > window.innerWidth / 2 ? "left" : "right";
      setPosition(isRTL ? "left" : preferred);
    };

    computePosition();
    window.addEventListener("resize", computePosition);
    return () => window.removeEventListener("resize", computePosition);
  }, [sidebarRefs]);

  return { position, offset: defaultOffset };
}
