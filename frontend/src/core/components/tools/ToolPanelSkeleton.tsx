import SkeletonLoader from "@app/components/shared/SkeletonLoader";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";

interface ToolPanelSkeletonProps {
  isMobile?: boolean;
}

export default function ToolPanelSkeleton({
  isMobile: isMobileProp,
}: ToolPanelSkeletonProps) {
  const isMobileHook = useIsMobile();
  const isMobile = isMobileProp ?? isMobileHook;
  const { isPanelVisible } = useToolWorkflow();

  const width = isMobile ? "100%" : isPanelVisible ? "18.5rem" : "0";

  return (
    <div
      className="tool-panel-skeleton"
      style={{
        width,
        height: isMobile ? "100%" : "100vh",
        backgroundColor: "var(--bg-toolbar)",
        borderRight: isMobile ? "none" : "1px solid var(--border-subtle)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <SkeletonLoader type="toolList" count={12} />
    </div>
  );
}
