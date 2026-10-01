import { Trans } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@app/components/onboarding/slides/unifiedBackgroundConfig";

const ProcessorIntroBody = () => (
  <span>
    <Trans
      i18nKey="onboarding.processorIntro.body"
      components={{ strong: <strong /> }}
      defaults="Stirling now runs <strong>Policies</strong> — automated rules that classify, secure, and process every document as it arrives. Set them up and monitor runs in the <strong>Processor</strong>."
    />
  </span>
);

export default function ProcessorIntroSlide(): SlideConfig {
  return {
    key: "processor-intro",
    title: (
      <Trans
        i18nKey="onboarding.processorIntro.title"
        defaults="Check out the Stirling Processor"
      />
    ),
    body: <ProcessorIntroBody />,
    background: {
      gradientStops: ["#2563EB", "#7C3AED"],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
