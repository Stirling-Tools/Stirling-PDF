import { ReactNode } from "react";
import { AppProviders as ProprietaryAppProviders } from "@editor-proprietary/components/AppProviders";
import { DesktopBannerInitializer } from "@editor/components/DesktopBannerInitializer";
import { ProcessorStartupView } from "@editor/components/ProcessorStartupView";
import { SaveShortcutListener } from "@editor/components/SaveShortcutListener";
import { DiskConflictHost } from "@editor/components/shared/DiskConflictHost";
import { DesktopOnboardingModal } from "@editor/components/DesktopOnboardingModal";
import { DesktopSaasOnboardingBootstrap } from "@editor/components/DesktopSaasOnboardingBootstrap";
import { ClassificationBackgroundRunner } from "@editor/components/onboarding/classificationDemo/ClassificationBackgroundRunner";
import { OPEN_SIGN_IN_EVENT } from "@editor/constants/signInEvents";
import { ToolActionsContext } from "@editor/contexts/ToolActionsContext";
import { SaaSTeamProvider } from "@editor/contexts/SaaSTeamContext";
import { useDesktopSession } from "@editor/components/DesktopSession";

const toolActions = {
  onEndpointUnavailableClick: () =>
    window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT)),
};

/**
 * The editor's providers on desktop. The connection and backend lifecycle both
 * apps share lives in DesktopSessionProvider, and the access gate in the frame
 * (AppContentGate); this adds what only the editor needs.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { appKey, connectionMode } = useDesktopSession();

  return (
    <ProprietaryAppProviders>
      <ToolActionsContext.Provider value={toolActions}>
        <SaaSTeamProvider key={appKey}>
          <ProcessorStartupView />
          <DesktopBannerInitializer />
          <SaveShortcutListener />
          <DiskConflictHost />
          {children}
          {/* Desktop onboarding modal: welcome slide → sign-in slide, shown once on first launch */}
          <DesktopOnboardingModal />
          {/* SaaS product onboarding (cloud flow, minus the desktop-download slide),
              shown once after a SaaS sign-in. Mirrors saas's OnboardingBootstrap. */}
          <DesktopSaasOnboardingBootstrap connectionMode={connectionMode} />
          <ClassificationBackgroundRunner />
        </SaaSTeamProvider>
      </ToolActionsContext.Provider>
    </ProprietaryAppProviders>
  );
}
