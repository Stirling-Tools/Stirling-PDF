import { ReactNode, useEffect } from "react";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import { FileContextProvider } from "@editor/contexts/FileContext";
import { NavigationProvider } from "@editor/contexts/NavigationContext";
import { ToolRegistryProvider } from "@editor/contexts/ToolRegistryProvider";
import { FilesModalProvider } from "@editor/contexts/FilesModalContext";
import { ToolWorkflowProvider } from "@editor/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@editor/contexts/HotkeyContext";
import { SidebarProvider } from "@editor/contexts/SidebarContext";
import {
  PreferencesProvider,
  usePreferences,
} from "@editor/contexts/PreferencesContext";
import {
  AppConfigProvider,
  AppConfigProviderProps,
  AppConfigRetryOptions,
  useAppConfig,
} from "@editor/contexts/AppConfigContext";
import { WorkbenchBarProvider } from "@editor/contexts/WorkbenchBarContext";
import { ViewerProvider } from "@editor/contexts/ViewerContext";
import { SignatureProvider } from "@editor/contexts/SignatureContext";
import { SigningOverlayProvider } from "@editor/contexts/SigningOverlayContext";
import { AnnotationProvider } from "@editor/contexts/AnnotationContext";
import { TourOrchestrationProvider } from "@editor/contexts/TourOrchestrationContext";
import { AdminTourOrchestrationProvider } from "@editor/contexts/AdminTourOrchestrationContext";
import { PageEditorProvider } from "@editor/contexts/PageEditorContext";
import { BannerProvider } from "@editor/contexts/BannerContext";
import ErrorBoundary from "@editor/components/shared/ErrorBoundary";
import { usePosthogTracking } from "@editor/hooks/usePosthogTracking";
import { useScarfTracking } from "@editor/hooks/useScarfTracking";
import { useAppInitialization } from "@editor/hooks/useAppInitialization";
import { useLogoAssets } from "@editor/hooks/useLogoAssets";
import AppConfigLoader from "@editor/components/shared/AppConfigLoader";
import { UpdateStartupPopup } from "@editor/components/shared/UpdateStartupPopup";
import { RedactionProvider } from "@editor/contexts/RedactionContext";
import { FormFillProvider } from "@editor/tools/formFill/FormFillContext";
import { FolderFileContextProvider } from "@editor/contexts/FolderFileContext";
import { FolderProvider } from "@editor/contexts/FolderContext";

// Component to initialize scarf tracking (must be inside AppConfigProvider)
function ScarfTrackingInitializer() {
  useScarfTracking();
  return null;
}

function PosthogTrackingInitializer() {
  usePosthogTracking();
  return null;
}

// Component to run app-level initialization (must be inside AppProviders for context access)
function AppInitializer() {
  useAppInitialization();
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

// Avoid requirement to have props which are required in app providers anyway
type AppConfigProviderOverrides = Omit<
  AppConfigProviderProps,
  "children" | "retryOptions"
>;

export interface AppProvidersProps {
  children: ReactNode;
  appConfigRetryOptions?: AppConfigRetryOptions;
  appConfigProviderProps?: Partial<AppConfigProviderOverrides>;
}

// Component to sync server defaults to preferences when AppConfig loads
function ServerDefaultsSync() {
  const { config } = useAppConfig();
  const { updateServerDefaults } = usePreferences();

  useEffect(() => {
    if (config) {
      const serverDefaults = {
        hideUnavailableTools: config.defaultHideUnavailableTools ?? false,
        hideUnavailableConversions:
          config.defaultHideUnavailableConversions ?? false,
      };
      updateServerDefaults(serverDefaults);
    }
  }, [config, updateServerDefaults]);

  return null;
}

/**
 * Core application providers
 * Contains all providers needed for the core
 */
export function AppProviders({
  children,
  appConfigRetryOptions,
  appConfigProviderProps,
}: AppProvidersProps) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <BannerProvider>
            <AppConfigProvider
              retryOptions={appConfigRetryOptions}
              {...appConfigProviderProps}
            >
              <PosthogTrackingInitializer />
              <ScarfTrackingInitializer />
              <AppConfigLoader />
              <ServerDefaultsSync />
              {/* Auto-popup on startup when a newer Stirling-PDF release is available.
                  No-ops inside Tauri — the desktop popup handles that flow. */}
              <UpdateStartupPopup />
              <FileContextProvider
                enableUrlSync={true}
                enablePersistence={true}
              >
                <FolderProvider>
                  <AppInitializer />
                  <BrandingAssetManager />
                  <ToolRegistryProvider>
                    <NavigationProvider>
                      <FilesModalProvider>
                        <ToolWorkflowProvider>
                          <HotkeyProvider>
                            <SidebarProvider>
                              <ViewerProvider>
                                <PageEditorProvider>
                                  <SignatureProvider>
                                    <SigningOverlayProvider>
                                      <RedactionProvider>
                                        <FormFillProvider>
                                          <AnnotationProvider>
                                            <WorkbenchBarProvider>
                                              <TourOrchestrationProvider>
                                                <AdminTourOrchestrationProvider>
                                                  <FolderFileContextProvider>
                                                    {children}
                                                  </FolderFileContextProvider>
                                                </AdminTourOrchestrationProvider>
                                              </TourOrchestrationProvider>
                                            </WorkbenchBarProvider>
                                          </AnnotationProvider>
                                        </FormFillProvider>
                                      </RedactionProvider>
                                    </SigningOverlayProvider>
                                  </SignatureProvider>
                                </PageEditorProvider>
                              </ViewerProvider>
                            </SidebarProvider>
                          </HotkeyProvider>
                        </ToolWorkflowProvider>
                      </FilesModalProvider>
                    </NavigationProvider>
                  </ToolRegistryProvider>
                </FolderProvider>
              </FileContextProvider>
            </AppConfigProvider>
          </BannerProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
