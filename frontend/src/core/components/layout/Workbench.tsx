import { Box } from '@mantine/core';
import { useRainbowThemeContext } from '@app/components/shared/RainbowThemeProvider';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useFileState } from '@app/contexts/FileContext';
import { useNavigationState } from '@app/contexts/NavigationContext';
import { isBaseWorkbench } from '@app/types/workbench';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import styles from '@app/components/layout/Workbench.module.css';
import LandingPage from '@app/components/shared/LandingPage';
import Footer from '@app/components/shared/Footer';
import DismissAllErrorsButton from '@app/components/shared/DismissAllErrorsButton';
import FileStackView from '@app/components/layout/FileStackView';

// No props needed - component uses contexts directly
export default function Workbench() {
  const { isRainbowMode } = useRainbowThemeContext();
  const { config } = useAppConfig();

  // Use context-based hooks to eliminate all prop drilling
  const { selectors } = useFileState();
  const { workbench: currentView } = useNavigationState();
  const activeFiles = selectors.getFiles();
  const activeFileStubs = selectors.getStirlingFileStubs();
  const {
    customWorkbenchViews,
  } = useToolWorkflow();

  // Get navigation state - this is the source of truth
  const { selectedTool: selectedToolId } = useNavigationState();

  // Get tool registry from context (instead of direct hook call)
  const { toolRegistry } = useToolWorkflow();
  const selectedTool = selectedToolId ? toolRegistry[selectedToolId] : null;

  const renderMainContent = () => {
    // Check for custom workbench views first
    if (!isBaseWorkbench(currentView)) {
      const customView = customWorkbenchViews.find((view) => view.workbenchId === currentView && view.data != null);
      if (customView) {
        // PDF text editor handles its own empty state (shows dropzone when no document)
        const handlesOwnEmptyState = currentView === 'custom:pdfTextEditor';
        if (handlesOwnEmptyState || activeFiles.length > 0) {
          const CustomComponent = customView.component;
          return <CustomComponent data={customView.data} />;
        }
      }
    }

    // Show file stack view when there are active files
    if (activeFiles.length > 0) {
      return <FileStackView files={activeFileStubs} />;
    }

    // Show landing page when no files
    return (
      <LandingPage />
    );

  };

  return (
    <Box
      className="flex-1 h-full min-w-0 relative flex flex-col"
      data-tour="workbench"
      style={
        isRainbowMode
          ? {} // No background color in rainbow mode
          : { backgroundColor: 'var(--bg-background)' }
      }
    >
      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 relative z-10 ${styles.workbenchScrollable}`}
        style={{
          transition: 'opacity 0.15s ease-in-out',
        }}
      >
        {renderMainContent()}
      </Box>

      <Footer
        analyticsEnabled={config?.enableAnalytics === true}
        termsAndConditions={config?.termsAndConditions}
        privacyPolicy={config?.privacyPolicy}
        cookiePolicy={config?.cookiePolicy}
        impressum={config?.impressum}
        accessibilityStatement={config?.accessibilityStatement}
      />
    </Box>
  );
}
