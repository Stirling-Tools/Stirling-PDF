import { Suspense } from "react";
import { RainbowThemeProvider } from "./components/shared/RainbowThemeProvider";
import { FileContextProvider } from "./contexts/FileContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { FilesModalProvider } from "./contexts/FilesModalContext";
import { ToolWorkflowProvider } from "./contexts/ToolWorkflowContext";
import { HotkeyProvider } from "./contexts/HotkeyContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { AppConfigProvider } from "./contexts/AppConfigContext";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import HomePage from "./pages/HomePage";
import { useScarfTracking } from "./hooks/useScarfTracking";

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
            <AppConfigProvider>
              <ScarfTrackingInitializer />
              <FileContextProvider enableUrlSync={true} enablePersistence={true}>
                <NavigationProvider>
                  <FilesModalProvider>
                    <ToolWorkflowProvider>
                      <HotkeyProvider>
                        <SidebarProvider>
                          <ViewerProvider>
                            <SignatureProvider>
                              <RightRailProvider>
                                <HomePage />
                              </RightRailProvider>
                            </SignatureProvider>
                          </ViewerProvider>
                        </SidebarProvider>
                      </HotkeyProvider>
                    </ToolWorkflowProvider>
                  </FilesModalProvider>
                </NavigationProvider>
              </FileContextProvider>
            </AppConfigProvider>
          </ErrorBoundary>
        </RainbowThemeProvider>
      </PreferencesProvider>
    </Suspense>
  );
}
