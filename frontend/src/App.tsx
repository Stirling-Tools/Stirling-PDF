import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { RainbowThemeProvider } from "./components/shared/RainbowThemeProvider";
import { FileContextProvider } from "./contexts/FileContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { ToolRegistryProvider } from "./contexts/ToolRegistryProvider";
import { FilesModalProvider } from "./contexts/FilesModalContext";
import { ToolWorkflowProvider } from "./contexts/ToolWorkflowContext";
import { HotkeyProvider } from "./contexts/HotkeyContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { AppConfigProvider } from "./contexts/AppConfigContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { TourOrchestrationProvider } from "./contexts/TourOrchestrationContext";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OnboardingTour from "./components/onboarding/OnboardingTour";
import { useScarfTracking } from "./hooks/useScarfTracking";

// Import auth components
import { AuthProvider } from "./auth/UseSession";
import Landing from "./routes/Landing";
import Login from "./routes/Login";
import Signup from "./routes/Signup";
import AuthCallback from "./routes/AuthCallback";

// Import global styles
import "./styles/tailwind.css";
import "./styles/cookieconsent.css";
import "./index.css";
import { RightRailProvider } from "./contexts/RightRailContext";
import { ViewerProvider } from "./contexts/ViewerContext";
import { SignatureProvider } from "./contexts/SignatureContext";

// Import file ID debugging helpers (development only)
import "./utils/fileIdSafety";

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

// Component to initialize scarf tracking (must be inside AppConfigProvider)
function ScarfTrackingInitializer() {
  useScarfTracking();
  return null;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
    <PreferencesProvider>
        <RainbowThemeProvider>
          <ErrorBoundary>
            <AuthProvider>
              <Routes>
                {/* Auth routes - no FileContext or other providers needed */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

                {/* Main app routes - wrapped with all providers */}
                <Route
                  path="/*"
                  element={
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
                          </AppConfigProvider>
                      </OnboardingProvider>
                  }
                />
              </Routes>
            </AuthProvider>
          </ErrorBoundary>
        </RainbowThemeProvider>
      </PreferencesProvider>
    </Suspense>
  );
}
