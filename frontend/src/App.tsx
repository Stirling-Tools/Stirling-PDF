import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { RainbowThemeProvider } from "@app/components/shared/RainbowThemeProvider";
import { FileContextProvider } from "@app/contexts/FileContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import { FilesModalProvider } from "@app/contexts/FilesModalContext";
import { ToolWorkflowProvider } from "@app/contexts/ToolWorkflowContext";
import { HotkeyProvider } from "@app/contexts/HotkeyContext";
import { SidebarProvider } from "@app/contexts/SidebarContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { OnboardingProvider } from "@app/contexts/OnboardingContext";
import { TourOrchestrationProvider } from "@app/contexts/TourOrchestrationContext";
import ErrorBoundary from "@app/components/shared/ErrorBoundary";
import OnboardingTour from "@app/components/onboarding/OnboardingTour";

// Import auth components
import { AuthBoundary } from "@app/auth/AuthBoundary";
import Landing from "@app/routes/Landing";
import { getAuthRoutes } from "@app/routes/AuthRoutes";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "./index.css";
import { RightRailProvider } from "@app/contexts/RightRailContext";
import { ViewerProvider } from "@app/contexts/ViewerContext";
import { SignatureProvider } from "@app/contexts/SignatureContext";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

// Loading component for i18next suspense
const LoadingFallback = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      fontSize: "18px",
      color: "#666",
    }}
  >
    Loading...
  </div>
);

export default function App() {
  const authRoutes = getAuthRoutes();

  return (
    <Suspense fallback={<LoadingFallback />}>
    <PreferencesProvider>
        <RainbowThemeProvider>
          <ErrorBoundary>
            <AuthBoundary>
              <Routes>
                {authRoutes}
                {/* Main app routes - wrapped with all providers */}
                <Route
                  path="/*"
                  element={
                    <OnboardingProvider>
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
                                            <Landing />
                                            <OnboardingTour />
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
                      </OnboardingProvider>
                  }
                />
              </Routes>
            </AuthBoundary>
          </ErrorBoundary>
        </RainbowThemeProvider>
      </PreferencesProvider>
    </Suspense>
  );
}
