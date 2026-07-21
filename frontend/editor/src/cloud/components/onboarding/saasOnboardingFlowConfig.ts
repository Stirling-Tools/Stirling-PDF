import FreeEditorSlide from "@app/components/onboarding/slides/FreeEditorSlide";
import UsageSnapshotSlide from "@app/components/onboarding/slides/UsageSnapshotSlide";
import TeamSlide from "@app/components/onboarding/slides/TeamSlide";
import DesktopInstallSlide from "@app/components/onboarding/slides/DesktopInstallSlide";
import type {
  OSOption,
  ButtonDefinition as ButtonDefinitionBase,
  HeroDefinition as HeroDefinitionBase,
  SlideDefinition as SlideDefinitionBase,
} from "@app/components/onboarding/onboardingSlideTypes";

export type { OSOption };

export type SlideId = "free-editor" | "usage" | "team" | "desktop-install";

export type HeroType = "logo" | "bolt" | "team" | "dual-icon";

export type ButtonAction = "next" | "prev" | "close" | "download-selected";

export type FlowState = Record<string, never>;

export interface SlideFactoryParams {
  osLabel: string;
  osUrl: string;
  osOptions?: OSOption[];
  onDownloadUrlChange?: (url: string) => void;
}

export type HeroDefinition = HeroDefinitionBase<HeroType>;

export type ButtonDefinition = ButtonDefinitionBase<ButtonAction, FlowState>;

export type SlideDefinition = SlideDefinitionBase<
  SlideId,
  ButtonAction,
  FlowState,
  HeroType,
  SlideFactoryParams
>;

const BACK_BUTTON: ButtonDefinition = {
  key: "back",
  type: "icon",
  icon: "chevron-left",
  group: "left",
  action: "prev",
};

const NEXT_BUTTON: ButtonDefinition = {
  key: "next",
  type: "button",
  label: "onboarding.buttons.next",
  variant: "primary",
  group: "right",
  action: "next",
};

export const SLIDE_DEFINITIONS: Record<SlideId, SlideDefinition> = {
  "free-editor": {
    id: "free-editor",
    createSlide: () => FreeEditorSlide(),
    hero: { type: "logo" },
    buttons: [{ ...NEXT_BUTTON, key: "free-editor-next" }],
  },
  usage: {
    id: "usage",
    createSlide: () => UsageSnapshotSlide(),
    hero: { type: "bolt" },
    buttons: [
      { ...BACK_BUTTON, key: "usage-back" },
      { ...NEXT_BUTTON, key: "usage-next" },
    ],
  },
  team: {
    id: "team",
    createSlide: () => TeamSlide(),
    hero: { type: "team" },
    buttons: [
      { ...BACK_BUTTON, key: "team-back" },
      { ...NEXT_BUTTON, key: "team-next" },
    ],
  },
  "desktop-install": {
    id: "desktop-install",
    createSlide: ({ osLabel, osUrl, osOptions, onDownloadUrlChange }) =>
      DesktopInstallSlide({ osLabel, osUrl, osOptions, onDownloadUrlChange }),
    hero: { type: "dual-icon" },
    buttons: [
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
