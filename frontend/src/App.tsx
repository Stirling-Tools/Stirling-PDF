import { Suspense } from "react";
import { RainbowThemeProvider } from "./components/shared/RainbowThemeProvider";
import { FileContextProvider } from "./contexts/FileContext";
import { NavigationProvider } from "./contexts/NavigationContext";
import { FilesModalProvider } from "./contexts/FilesModalContext";
import { ToolWorkflowProvider } from "./contexts/ToolWorkflowContext";
import { HotkeyProvider } from "./contexts/HotkeyContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import HomePage from "./pages/HomePage";

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
      <RainbowThemeProvider>
        <ErrorBoundary>
          <PreferencesProvider>
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
          </PreferencesProvider>
        </ErrorBoundary>
      </RainbowThemeProvider>
    </Suspense>
  );
}
