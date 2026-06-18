import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useAuth } from "@app/auth/UseSession";
import { useOs } from "@app/hooks/useOs";
import { useWallet } from "@app/hooks/useWallet";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import {
  SLIDE_DEFINITIONS,
  type ButtonAction,
  type FlowState,
  type SlideId,
} from "@app/components/onboarding/saasOnboardingFlowConfig";
import { resolveSaasFlow } from "@app/components/onboarding/saasFlowResolver";
import { DOWNLOAD_URLS } from "@app/constants/downloads";
import { openExternal } from "@app/platform/openExternal";

interface UseSaasOnboardingStateResult {
  currentStep: number;
  totalSteps: number;
  slideDefinition: (typeof SLIDE_DEFINITIONS)[SlideId];
  currentSlide: ReturnType<(typeof SLIDE_DEFINITIONS)[SlideId]["createSlide"]>;
  flowState: FlowState;
  handleButtonAction: (action: ButtonAction) => void;
}

interface UseSaasOnboardingStateProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Drop the closing "desktop-install" slide. The desktop app reuses this
   * flow but has no reason to pitch its own download. Defaults to false
   * (slide shown) so the web (saas) flow is unchanged.
   */
  hideDesktopInstall?: boolean;
}

export function useSaasOnboardingState({
  opened,
  onClose,
  hideDesktopInstall = false,
}: UseSaasOnboardingStateProps): UseSaasOnboardingStateResult | null {
  const { loading } = useAuth();
  const { wallet } = useWallet();
  const { isTeamLeader } = useSaaSTeam();
  const osType = useOs();
  const selectedDownloadUrlRef = useRef<string>("");

  const [currentStep, setCurrentStep] = useState<number>(0);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      setCurrentStep(0);
    }
  }, [opened]);

  // Determine OS details for desktop download
  const os = useMemo(() => {
    switch (osType) {
      case "windows":
        return { label: "Windows", url: DOWNLOAD_URLS.WINDOWS };
      case "mac":
        return { label: "Mac", url: DOWNLOAD_URLS.MAC };
      case "linux-x64":
      case "linux-arm64":
        return { label: "Linux", url: DOWNLOAD_URLS.LINUX_DOCS };
      default:
        return { label: "", url: "" };
    }
  }, [osType]);

  const osOptions = useMemo(() => {
    const options = [
      { label: "Windows", url: DOWNLOAD_URLS.WINDOWS, value: "windows" },
      { label: "Mac", url: DOWNLOAD_URLS.MAC, value: "mac" },
      { label: "Linux", url: DOWNLOAD_URLS.LINUX_DOCS, value: "linux" },
    ];
    return options.filter((opt) => opt.url);
  }, []);

  // Store selected download URL
  const handleDownloadUrlChange = useCallback((url: string) => {
    selectedDownloadUrlRef.current = url;
  }, []);

  // Usage meter only makes sense for free-tier wallets with allowance left;
  // the team slide is for leaders (anonymous guests are never leaders).
  const showUsageSlide = wallet?.status === "free" && wallet.freeRemaining > 0;
  const showTeamSlide = isTeamLeader;

  const flowSlideIds = useMemo(
    () =>
      resolveSaasFlow({ showUsageSlide, showTeamSlide, hideDesktopInstall }),
    [showUsageSlide, showTeamSlide, hideDesktopInstall],
  );
  const totalSteps = flowSlideIds.length;
  const maxIndex = Math.max(totalSteps - 1, 0);

  // Ensure current step is within bounds
  useEffect(() => {
    if (currentStep >= flowSlideIds.length) {
      setCurrentStep(Math.max(flowSlideIds.length - 1, 0));
    }
  }, [flowSlideIds.length, currentStep]);

  const currentSlideId =
    flowSlideIds[currentStep] ?? flowSlideIds[flowSlideIds.length - 1];
  const slideDefinition = SLIDE_DEFINITIONS[currentSlideId];

  // Create slide with appropriate params - must be called before any early returns
  const currentSlide = useMemo(() => {
    if (!slideDefinition) return null;
    return slideDefinition.createSlide({
      osLabel: os.label,
      osUrl: os.url,
      osOptions,
      onDownloadUrlChange: handleDownloadUrlChange,
    });
  }, [slideDefinition, os.label, os.url, osOptions, handleDownloadUrlChange]);

  // Navigation functions
  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, maxIndex));
  }, [maxIndex]);

  const goPrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Handle button actions
  const handleButtonAction = useCallback(
    (action: ButtonAction) => {
      switch (action) {
        case "next":
          // If on last slide, close modal
          if (currentStep === maxIndex) {
            onClose();
          } else {
            goNext();
          }
          return;
        case "prev":
          goPrev();
          return;
        case "close":
          onClose();
          return;
        case "download-selected": {
          // Open the download URL in the user's browser via the platform seam
          // (saas opens a new tab, desktop hands off to the OS shell).
          const downloadUrl = selectedDownloadUrlRef.current || os.url;
          if (downloadUrl) {
            void openExternal(downloadUrl);
          }
          // Then advance to next slide or close if last
          if (currentStep === maxIndex) {
            onClose();
          } else {
            goNext();
          }
          return;
        }
        default:
          console.warn(`Unhandled button action: ${action}`);
          return;
      }
    },
    [currentStep, maxIndex, goNext, goPrev, onClose, os.url],
  );

  const flowState: FlowState = {};

  // Early return after all hooks have been called
  if (!slideDefinition || !currentSlide || loading) {
    return null;
  }

  return {
    currentStep,
    totalSteps,
    slideDefinition,
    currentSlide,
    flowState,
    handleButtonAction,
  };
}
