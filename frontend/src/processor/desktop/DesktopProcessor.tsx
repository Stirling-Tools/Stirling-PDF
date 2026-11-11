import { PortalApp } from "@processor-proprietary/PortalApp";
import { ProcessorEditionBoundary } from "@processor/ProcessorEditionBoundary";
import "@editor/portal/DesktopProcessor.css";

/**
 * The Processor beside the editor, as on the web. The edition boundary picks
 * the Stirling Cloud or self-hosted seams from the connection and drops their
 * state when it changes.
 */
export function DesktopProcessor() {
  return (
    <ProcessorEditionBoundary>
      <div className="desktop-processor">
        <PortalApp />
      </div>
    </ProcessorEditionBoundary>
  );
}
