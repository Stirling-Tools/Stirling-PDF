import { EditorStatusCard } from "@processor/components/EditorStatusCard";
import { ConnectAccountRail } from "@processor/components/ConnectAccountRail";

export function HomeHero() {
  return (
    <>
      <ConnectAccountRail />
      <EditorStatusCard />
    </>
  );
}
