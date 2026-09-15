import { type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getProcessorQueryClient } from "@processor/queryClient";
import { ProcessorSettingsProviders } from "@processor/components/settings/ProcessorSettingsProviders";
import { ErrorBoundary } from "@processor/components/ErrorBoundary";
import "@processor/theme/base.css";
import "@processor/components/settings/ProcessorSettingsSectionHost.css";

/**
 * Runs a processor-authored view inside the settings page. Those views are written
 * against the processor's own data and UI contexts and its scoped CSS reset, none
 * of which the editor tree provides — this host supplies exactly that much of
 * the processor, and nothing of its chrome. The query client is the processor's
 * shared singleton, so a view opened here and the same view opened in the
 * processor read one cache.
 */
export function ProcessorSettingsSectionHost({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={getProcessorQueryClient()}>
      <div className="processor-settings-section processor-scope">
        <ProcessorSettingsProviders>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ProcessorSettingsProviders>
      </div>
    </QueryClientProvider>
  );
}
