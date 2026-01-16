import { SlideConfig } from "@app/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@app/components/onboarding/slides/unifiedBackgroundConfig";

export default function MFASetupSlide(): SlideConfig {
  return {
    key: "mfa-setup-slide",
    title: "Multi-Factor Authentication Setup",
    body: "Please set up multi-factor authentication to enhance your account security.",
    background: {
      gradientStops: ["#059669", "#0891B2"], // Green to teal - security/trust colors
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
