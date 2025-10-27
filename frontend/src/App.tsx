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
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { TourOrchestrationProvider } from "./contexts/TourOrchestrationContext";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import OnboardingTour from "./components/onboarding/OnboardingTour";

// Import auth components
import { AuthProvider } from "./auth/UseSession";
import Landing from "./routes/Landing";
import Login from "./routes/Login";
import Signup from "./routes/Signup";
import AuthCallback from "./routes/AuthCallback";
import InviteAccept from "./routes/InviteAccept";

// Import global styles
import "./styles/tailwind.css";
import "./index.css";

// Load cookieconsent.css optionally - won't block UI if ad blocker blocks it
const loadOptionalCSS = () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/src/styles/cookieconsent.css';
  link.onerror = () => {
    console.debug('Cookie consent styles blocked by ad blocker - continuing without them');
  };
  document.head.appendChild(link);
};
// Load it once when app initializes
if (typeof document !== 'undefined') {
  loadOptionalCSS();
}
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
                <Route path="/invite" element={<InviteAccept />} />
                <Route path="/auth/callback" element={<AuthCallback />} />

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
            </AuthProvider>
          </ErrorBoundary>
        </RainbowThemeProvider>
      </PreferencesProvider>
    </Suspense>
  );
}
