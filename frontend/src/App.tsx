import React, { Suspense } from "react";
import { RainbowThemeProvider } from "./components/shared/RainbowThemeProvider";
import { FileContextProvider } from "./contexts/FileContext";
import { FilesModalProvider } from "./contexts/FilesModalContext";
import { FileSelectionProvider } from "./contexts/FileSelectionContext";
import { ToolWorkflowProvider } from "./contexts/ToolWorkflowContext";
import { ToolNavigationProvider } from "./contexts/ToolNavigationContext";
import { SidebarProvider } from "./contexts/SidebarContext";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import HomePage from "./pages/HomePage";

// Import global styles
import "./styles/tailwind.css";
import "./index.css";

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
          <FileContextProvider enableUrlSync={true} enablePersistence={true}>
            <FilesModalProvider>
              <FileSelectionProvider>
                <ToolNavigationProvider>
                  <ToolWorkflowProvider>
                    <SidebarProvider>
                      <HomePage />
                    </SidebarProvider>
                  </ToolWorkflowProvider>
                </ToolNavigationProvider>
              </FileSelectionProvider>
            </FilesModalProvider>
          </FileContextProvider>
        </ErrorBoundary>
      </RainbowThemeProvider>
    </Suspense>
  );
}
