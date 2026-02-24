import { ReactNode, useEffect } from "react";
import { RainbowThemeProvider } from "@app/components/shared/RainbowThemeProvider";
import { FileContextProvider } from "@app/contexts/FileContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { PluginRegistryProvider } from "@app/contexts/PluginRegistryContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { FilesModalProvider } from "@app/contexts/FilesModalContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";
import { SidebarProvider } from "@app/contexts/SidebarContext";
import { PreferencesProvider, usePreferences } from "@app/contexts/PreferencesContext";
import { AppConfigProvider, AppConfigProviderProps, AppConfigRetryOptions, useAppConfig } from "@app/contexts/AppConfigContext";
import { RightRailProvider } from "@app/contexts/RightRailContext";
import { ViewerProvider } from "@app/contexts/ViewerContext";
import { SignatureProvider } from "@app/contexts/SignatureContext";
import { AnnotationProvider } from "@app/contexts/AnnotationContext";
import { TourOrchestrationProvider } from "@app/contexts/TourOrchestrationContext";
import { AdminTourOrchestrationProvider } from "@app/contexts/AdminTourOrchestrationContext";
import { PageEditorProvider } from "@app/contexts/PageEditorContext";
import { BannerProvider } from "@app/contexts/BannerContext";
import ErrorBoundary from "@app/components/shared/ErrorBoundary";
import { useScarfTracking } from "@app/hooks/useScarfTracking";
import { useAppInitialization } from "@app/hooks/useAppInitialization";
import { useLogoAssets } from '@app/hooks/useLogoAssets';
import AppConfigLoader from '@app/components/shared/AppConfigLoader';
import { RedactionProvider } from "@app/contexts/RedactionContext";
import { FormFillProvider } from "@app/tools/formFill/FormFillContext";

// Component to initialize scarf tracking (must be inside AppConfigProvider)
function ScarfTrackingInitializer() {
  useScarfTracking();
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
    if (typeof document === 'undefined') {
      return;
    }

    const setLinkHref = (selector: string, href: string) => {
      const link = document.querySelector<HTMLLinkElement>(selector);
      if (link && link.getAttribute('href') !== href) {
        link.setAttribute('href', href);
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
type AppConfigProviderOverrides = Omit<AppConfigProviderProps, 'children' | 'retryOptions'>;

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
        hideUnavailableConversions: config.defaultHideUnavailableConversions ?? false,
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
export function AppProviders({ children, appConfigRetryOptions, appConfigProviderProps }: AppProvidersProps) {
  return (
    <PreferencesProvider>
      <RainbowThemeProvider>
        <ErrorBoundary>
          <BannerProvider>
              <AppConfigProvider
                retryOptions={appConfigRetryOptions}
                {...appConfigProviderProps}
              >
                <ScarfTrackingInitializer />
                <AppConfigLoader />
                <ServerDefaultsSync />
                <FileContextProvider enableUrlSync={true} enablePersistence={true}>
                  <AppInitializer />
                  <BrandingAssetManager />
                  <PluginRegistryProvider>
                    <ToolRegistryProvider>
                      <NavigationProvider>
                        <FilesModalProvider>
                          <ToolWorkflowProvider>
                            <HotkeyProvider>
                              <SidebarProvider>
                                <ViewerProvider>
                                  <PageEditorProvider>
                                    <SignatureProvider>
                                      <RedactionProvider>
                                      <FormFillProvider>
                                      <AnnotationProvider>
                                        <RightRailProvider>
                                          <TourOrchestrationProvider>
                                            <AdminTourOrchestrationProvider>
                                              {children}
                                            </AdminTourOrchestrationProvider>
                                          </TourOrchestrationProvider>
                                        </RightRailProvider>
                                      </AnnotationProvider>
                                      </FormFillProvider>
                                      </RedactionProvider>
                                    </SignatureProvider>
                                  </PageEditorProvider>
                                </ViewerProvider>
                              </SidebarProvider>
                            </HotkeyProvider>
                          </ToolWorkflowProvider>
                        </FilesModalProvider>
                      </NavigationProvider>
                    </ToolRegistryProvider>
                  </PluginRegistryProvider>
                  </FileContextProvider>
              </AppConfigProvider>
          </BannerProvider>
        </ErrorBoundary>
      </RainbowThemeProvider>
    </PreferencesProvider>
  );
}
