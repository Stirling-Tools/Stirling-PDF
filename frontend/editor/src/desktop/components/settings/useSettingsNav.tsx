import { useEffect, useState } from "react";
import { useSettingsNav as useProprietarySettingsNav } from "@proprietary/components/settings/useSettingsNav";
import type { SettingsNav } from "@app/components/settings/settingsNavTypes";
import { connectionModeService } from "@app/services/connectionModeService";

export type { SettingsNav };

/** Desktop billing opens on the web; existing Plan links land on its browser handoff. */
export function useSettingsNav(onLeave: () => void): SettingsNav {
  const nav = useProprietarySettingsNav(onLeave);
  const [connectionReady, setConnectionReady] = useState(false);
  useEffect(() => {
    let active = true;
    void connectionModeService.getCurrentMode().then(() => {
      if (active) setConnectionReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const hasBilling = nav.sections.some((group) =>
    group.items.some((item) => item.key === "billing"),
  );
  return {
    ...nav,
    pending: nav.pending || !connectionReady,
    aliases: hasBilling
      ? { ...nav.aliases, plan: "billing", adminPlan: "billing" }
      : nav.aliases,
  };
}
