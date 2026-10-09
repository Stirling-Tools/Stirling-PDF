import { PortalApp } from "@portal-proprietary/PortalApp";
import { ProcessorEditionBoundary } from "@portal/ProcessorEditionBoundary";
import "@app/portal/DesktopProcessor.css";

/**
 * The Processor as a page of the desktop app, under the editor's providers, so
 * the connection, session and open files survive moving between the two. The
 * web mounts it beside the editor instead.
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
