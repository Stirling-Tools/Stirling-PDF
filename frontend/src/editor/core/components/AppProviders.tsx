import { ReactNode, useEffect } from "react";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import { FileContextProvider } from "@editor/contexts/FileContext";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { FilesModalProvider } from "@editor/contexts/FilesModalContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";
import { DamagedFileRepairProvider } from "@editor/contexts/DamagedFileRepairContext";
import { HotkeyProvider } from "@editor/contexts/HotkeyContext";
import { SidebarProvider } from "@editor/contexts/SidebarContext";
import {
  PreferencesProvider,
  usePreferences,
} from "@editor/contexts/PreferencesContext";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { WorkbenchBarProvider } from "@editor/contexts/WorkbenchBarContext";
import { ViewerProvider } from "@editor/contexts/ViewerContext";
import { SignatureProvider } from "@editor/contexts/SignatureContext";
import { SigningOverlayProvider } from "@editor/contexts/SigningOverlayContext";
import { AnnotationProvider } from "@editor/contexts/AnnotationContext";
import { TourOrchestrationProvider } from "@editor/contexts/TourOrchestrationContext";
import { AdminTourOrchestrationProvider } from "@editor/contexts/AdminTourOrchestrationContext";
import { BannerProvider } from "@editor/contexts/BannerContext";
import ErrorBoundary from "@editor/components/shared/ErrorBoundary";
import { useAppInitialization } from "@editor/hooks/useAppInitialization";
import { useLogoAssets } from "@editor/hooks/useLogoAssets";
import AppConfigLoader from "@editor/components/shared/AppConfigLoader";
import { UpdateStartupPopup } from "@editor/components/shared/UpdateStartupPopup";
import { RedactionProvider } from "@editor/contexts/RedactionContext";
import { FormFillProvider } from "@editor/tools/formFill/FormFillContext";
import { FolderProvider } from "@editor/contexts/FolderContext";
import { WorkbenchSessionPersistence } from "@editor/components/session/WorkbenchSessionPersistence";
import { retireLegacyFolderWorker } from "@editor/services/retireLegacyFolderWorker";
import type { UserPreferences } from "@editor/services/preferencesService";

// Component to run app-level initialization (must be inside AppProviders for context access)
function AppInitializer() {
  useAppInitialization();
  useEffect(() => {
    void retireLegacyFolderWorker();
  }, []);
  return null;
}

function BrandingAssetManager() {
  const { favicon, logo192, manifestHref } = useLogoAssets();

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const setLinkHref = (selector: string, href: string) => {
      const link = document.querySelector<HTMLLinkElement>(selector);
      if (link && link.getAttribute("href") !== href) {
        link.setAttribute("href", href);
      }
    };

    setLinkHref('link[rel="icon"]', favicon);
    setLinkHref('link[rel="shortcut icon"]', favicon);
    setLinkHref('link[rel="apple-touch-icon"]', logo192);
    setLinkHref('link[rel="manifest"]', manifestHref);
  }, [favicon, logo192, manifestHref]);

  return null;
}

export interface AppProvidersProps {
  children: ReactNode;
}

// Component to sync server defaults to preferences when AppConfig loads
function ServerDefaultsSync() {
  const { config, configFromServer } = useAppConfig();
  const { updateServerDefaults } = usePreferences();

  useEffect(() => {
    // A stand-in (401 default, auth-page fallback, desktop startup config)
    // must not count as the server's answer. Installing it marks defaults as
    // loaded and the launch then locks in "tools".
    if (config && configFromServer) {
      // Only known values. An absent or unexpected field must not clobber the
      // hardcoded default via an explicit `undefined` in the merge.
      const serverDefaults: Partial<UserPreferences> = {
        hideUnavailableTools: config.defaultHideUnavailableTools ?? false,
        hideUnavailableConversions:
          config.defaultHideUnavailableConversions ?? false,
      };
      if (
        config.defaultToolPanelMode === "sidebar" ||
        config.defaultToolPanelMode === "fullscreen"
      ) {
        serverDefaults.defaultToolPanelMode = config.defaultToolPanelMode;
      }
      if (
        config.defaultStartupView === "tools" ||
        config.defaultStartupView === "read" ||
        config.defaultStartupView === "automate"
      ) {
        serverDefaults.defaultStartupView = config.defaultStartupView;
      }
      updateServerDefaults(serverDefaults);
    }
  }, [config, configFromServer, updateServerDefaults]);

  return null;
}

/** The editor's own providers. Expects PlatformProviders above it. */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <BannerProvider>
            <AppConfigLoader />
            <ServerDefaultsSync />
            {/* Auto-popup on startup when a newer Stirling-PDF release is available.
              No-ops inside Tauri — the desktop popup handles that flow. */}
            <UpdateStartupPopup />
            <FileContextProvider enableUrlSync={true} enablePersistence={true}>
              <FolderProvider>
                <AppInitializer />
                <BrandingAssetManager />
                <NavigationProvider>
                  <FilesModalProvider>
                    <ToolWorkflowProvider>
                      <HotkeyProvider>
                        <SidebarProvider>
                          <ViewerProvider>
                            <SignatureProvider>
                              <SigningOverlayProvider>
                                <RedactionProvider>
                                  <FormFillProvider>
                                    <AnnotationProvider>
                                      <WorkbenchBarProvider>
                                        <TourOrchestrationProvider>
                                          <AdminTourOrchestrationProvider>
                                            <WorkbenchSessionPersistence />
                                            <DamagedFileRepairProvider>
                                              {children}
                                            </DamagedFileRepairProvider>
                                          </AdminTourOrchestrationProvider>
                                        </TourOrchestrationProvider>
                                      </WorkbenchBarProvider>
                                    </AnnotationProvider>
                                  </FormFillProvider>
                                </RedactionProvider>
                              </SigningOverlayProvider>
                            </SignatureProvider>
                          </ViewerProvider>
                        </SidebarProvider>
                      </HotkeyProvider>
                    </ToolWorkflowProvider>
                  </FilesModalProvider>
                </NavigationProvider>
              </FolderProvider>
            </FileContextProvider>
          </BannerProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
