import WelcomeSlide from "@app/components/onboarding/slides/WelcomeSlide";
import DesktopInstallSlide from "@app/components/onboarding/slides/DesktopInstallSlide";
import FreeTrialSlide from "@app/components/onboarding/slides/FreeTrialSlide";
import { SlideConfig } from "@app/types/types";
import { TrialStatus } from "@app/auth/UseSession";

export type SlideId = "welcome" | "free-trial" | "desktop-install";

export type HeroType = "rocket" | "dual-icon" | "diamond";

export type ButtonAction = "next" | "prev" | "close" | "download-selected";

export type FlowState = Record<string, never>;

export interface OSOption {
  label: string;
  url: string;
  value: string;
}

export interface SlideFactoryParams {
  osLabel: string;
  osUrl: string;
  osOptions?: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
  trialStatus?: TrialStatus | null;
}

export interface HeroDefinition {
  type: HeroType;
}

export interface ButtonDefinition {
  key: string;
  type: "button" | "icon";
  label?: string;
  icon?: "chevron-left";
  variant?: "primary" | "secondary" | "default";
  group: "left" | "right";
  action: ButtonAction;
  disabledWhen?: (state: FlowState) => boolean;
}

export interface SlideDefinition {
  id: SlideId;
  createSlide: (params: SlideFactoryParams) => SlideConfig;
  hero: HeroDefinition;
  buttons: ButtonDefinition[];
}

export const SLIDE_DEFINITIONS: Record<SlideId, SlideDefinition> = {
  welcome: {
    id: "welcome",
    createSlide: () => WelcomeSlide(),
    hero: { type: "rocket" },
    buttons: [
      {
        key: "welcome-next",
        type: "button",
        label: "onboarding.buttons.next",
        variant: "primary",
        group: "right",
        action: "next",
      },
    ],
  },
  "free-trial": {
    id: "free-trial",
    createSlide: ({ trialStatus }) => {
      if (!trialStatus) {
        throw new Error("Trial status is required for free-trial slide");
      }
      return FreeTrialSlide({ trialStatus });
    },
    hero: { type: "diamond" },
    buttons: [
      {
        key: "trial-back",
        type: "icon",
        icon: "chevron-left",
        group: "left",
        action: "prev",
      },
      {
        key: "trial-next",
        type: "button",
        label: "onboarding.buttons.next",
        variant: "primary",
        group: "right",
        action: "next",
      },
    ],
  },
  "desktop-install": {
    id: "desktop-install",
    createSlide: ({ osLabel, osUrl, osOptions, onDownloadUrlChange }) =>
      DesktopInstallSlide({ osLabel, osUrl, osOptions, onDownloadUrlChange }),
    hero: { type: "dual-icon" },
    buttons: [
      {
        key: "desktop-back",
        type: "icon",
        icon: "chevron-left",
        group: "left",
        action: "prev",
      },
      {
        key: "desktop-skip",
        type: "button",
        label: "onboarding.buttons.skipForNow",
        variant: "secondary",
        group: "left",
        action: "close",
      },
      {
        key: "desktop-download",
        type: "button",
        label: "onboarding.buttons.download",
        variant: "primary",
        group: "right",
        action: "download-selected",
      },
    ],
  },
};

export const FLOW_SEQUENCES = {
  saasTrialUser: ["welcome", "free-trial", "desktop-install"] as SlideId[],
  saasPaidUser: ["welcome", "desktop-install"] as SlideId[],
};
