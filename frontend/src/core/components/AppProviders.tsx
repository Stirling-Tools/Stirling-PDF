import { ReactNode } from "react";
import { RainbowThemeProvider } from "@app/components/shared/RainbowThemeProvider";
import { FileContextProvider } from "@app/contexts/FileContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { FilesModalProvider } from "@app/contexts/FilesModalContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";
import { SidebarProvider } from "@app/contexts/SidebarContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";
import { RightRailProvider } from "@app/contexts/RightRailContext";
import { ViewerProvider } from "@app/contexts/ViewerContext";
import { SignatureProvider } from "@app/contexts/SignatureContext";
import { OnboardingProvider } from "@app/contexts/OnboardingContext";
import { TourOrchestrationProvider } from "@app/contexts/TourOrchestrationContext";
import ErrorBoundary from "@app/components/shared/ErrorBoundary";
import { useScarfTracking } from "@app/hooks/useScarfTracking";

// Component to initialize scarf tracking (must be inside AppConfigProvider)
function ScarfTrackingInitializer() {
  useScarfTracking();
  return null;
}

/**
 * Core application providers
 * Contains all providers needed for the core
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <RainbowThemeProvider>
        <ErrorBoundary>
          <OnboardingProvider>
            <AppConfigProvider>
              <ScarfTrackingInitializer />
              <FileContextProvider enableUrlSync={true} enablePersistence={true}>
                <ToolRegistryProvider>
                  <NavigationProvider>
                    <FilesModalProvider>
                      <ToolWorkflowProvider>
                        <HotkeyProvider>
                          <SidebarProvider>
                            <ViewerProvider>
                              <SignatureProvider>
                                <RightRailProvider>
                                  <TourOrchestrationProvider>
                                    {children}
                                  </TourOrchestrationProvider>
                                </RightRailProvider>
                              </SignatureProvider>
                            </ViewerProvider>
                          </SidebarProvider>
                        </HotkeyProvider>
                      </ToolWorkflowProvider>
                    </FilesModalProvider>
                  </NavigationProvider>
                </ToolRegistryProvider>
              </FileContextProvider>
            </AppConfigProvider>
          </OnboardingProvider>
        </ErrorBoundary>
      </RainbowThemeProvider>
    </PreferencesProvider>
  );
}
