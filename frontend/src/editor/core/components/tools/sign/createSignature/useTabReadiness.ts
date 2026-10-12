import { useMemo, useState } from "react";
import type { CreateTab } from "@app/components/tools/sign/createSignature/types";

type TabReadiness = Partial<Record<CreateTab, boolean>>;

export function useTabReadiness() {
  const [ready, setReady] = useState<TabReadiness>({});
  const handlers = useMemo(() => {
    const handlerFor = (tab: CreateTab) => (value: boolean) =>
      setReady((prev) =>
        prev[tab] === value ? prev : { ...prev, [tab]: value },
      );
    return {
      draw: handlerFor("draw"),
      type: handlerFor("type"),
      upload: handlerFor("upload"),
      phone: handlerFor("phone"),
    };
  }, []);
  return { ready, handlers };
}
