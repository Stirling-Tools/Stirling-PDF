import { useTranslation } from "react-i18next";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { StepType } from "@reactour/tour";
import OnboardingTour from "@app/components/onboarding/OnboardingTour";
import "@app/components/onboarding/OnboardingTour.css";

/**
 * Selectors go unused here since the target elements don't exist on the
 * canvas, so reactour just centers the popover instead of anchoring to them.
 */
const SAMPLE_STEPS: StepType[] = [
  {
    selector: "body",
    content: "Welcome to Stirling PDF! Let's take a quick look around.",
  },
  {
    selector: "body",
    content: "Here you can upload and manage your <strong>files</strong>.",
  },
  {
    selector: "body",
    content: "This is the tools panel where you apply operations to a PDF.",
  },
];

function TourStage(props: {
  tourType?: string;
  isRTL?: boolean;
  dimBackground?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <OnboardingTour
      tourSteps={SAMPLE_STEPS}
      tourType={props.tourType ?? "welcome"}
      isRTL={props.isRTL ?? false}
      t={t}
      isOpen={true}
      onAdvance={({ setCurrentStep, currentStep, steps }) => {
        const isLast = currentStep === (steps?.length ?? 0) - 1;
        if (isLast) return;
        setCurrentStep((prev) => prev + 1);
      }}
      onClose={({ setIsOpen }) => setIsOpen(false)}
      dimBackground={props.dimBackground}
    />
  );
}

const meta = {
  title: "Onboarding/OnboardingTour",
  component: TourStage,
} satisfies Meta<typeof TourStage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default tour, mask dimmed to 70% opacity. */
export const Default: Story = { args: {} };

/** Admin tour uses a dark mask class instead of the default dim mask. */
export const AdminTour: Story = { args: { tourType: "admin" } };

/** RTL layout swaps the "next" arrow direction. */
export const RTL: Story = { args: { isRTL: true } };

/** `dimBackground={false}` keeps the page fully visible behind the popover. */
export const NoDim: Story = { args: { dimBackground: false } };
