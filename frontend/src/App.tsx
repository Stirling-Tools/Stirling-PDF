import { Suspense } from "react";
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
import HomePage from "./pages/HomePage";
import OnboardingTour from "./components/onboarding/OnboardingTour";

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

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PreferencesProvider>
        <RainbowThemeProvider>
          <ErrorBoundary>
            <OnboardingProvider>
              <FileContextProvider enableUrlSync={true} enablePersistence={true}>
                <ToolRegistryProvider>
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
                                      <HomePage />
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
                </ToolRegistryProvider>
              </FileContextProvider>
            </OnboardingProvider>
          </ErrorBoundary>
        </RainbowThemeProvider>
      </PreferencesProvider>
    </Suspense>
  );
}
