import { useState, type ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  initialOpenSection,
  nextOpenSection,
  type ExpandableSection,
  type SetupStepProps,
} from "@editor/components/serverSetup/SetupFields";
import {
  SetupScreen,
  SetupSignInScreen,
} from "@editor/components/serverSetup/SetupScreen";
import { SetupStepFrame } from "@editor/components/serverSetup/SetupStepFrame";
import {
  draftFromSettings,
  prefillAddresses,
  stepsFor,
  validateStep,
  type ServerSetupDraft,
  type SetupMode,
  type SetupStepId,
} from "@editor/components/serverSetup/serverSetupDraft";
import { useStepCopy } from "@editor/components/serverSetup/useStepCopy";
import { AddressesStep } from "@editor/components/serverSetup/steps/AddressesStep";
import { AiStep } from "@editor/components/serverSetup/steps/AiStep";
import { AnalyticsStep } from "@editor/components/serverSetup/steps/AnalyticsStep";
import { EmailStep } from "@editor/components/serverSetup/steps/EmailStep";
import { FilesStep } from "@editor/components/serverSetup/steps/FilesStep";
import { LanguageStep } from "@editor/components/serverSetup/steps/LanguageStep";
import { PasswordStep } from "@editor/components/serverSetup/steps/PasswordStep";
import { QuickSummaryStep } from "@editor/components/serverSetup/steps/QuickSummaryStep";
import { SignInStep } from "@editor/components/serverSetup/steps/SignInStep";
// The app loads the card's colours globally (App.tsx); a story has to load them itself.
import "@editor/auth/ui/auth-theme.css";

const STEPS: Record<SetupStepId, ComponentType<SetupStepProps>> = {
  addresses: AddressesStep,
  language: LanguageStep,
  signIn: SignInStep,
  email: EmailStep,
  files: FilesStep,
  ai: AiStep,
  analytics: AnalyticsStep,
  password: PasswordStep,
  summary: QuickSummaryStep,
};

interface StepPreviewProps {
  step: SetupStepId;
  mode?: SetupMode;
  /** Values the card opens with, over a new server's defaults. */
  draft?: Partial<ServerSetupDraft>;
  /** The server's values, for warnings that compare against them. */
  initial?: Partial<ServerSetupDraft>;
  openSection?: ExpandableSection | null;
  /** Show the errors Continue would, as the wizard does. */
  showErrors?: boolean;
  usingDefaultCredentials?: boolean;
  primaryLabel?: string;
}

/** One wizard card with a real step inside, editable, over sample settings. */
function StepPreview({
  step,
  mode = "custom",
  draft: draftPatch,
  initial: initialPatch,
  openSection: openAtStart,
  showErrors = false,
  usingDefaultCredentials = false,
  primaryLabel = "Continue",
}: StepPreviewProps) {
  const copy = useStepCopy();
  const [initial] = useState<ServerSetupDraft>(() => ({
    ...draftFromSettings({}),
    ...initialPatch,
  }));
  const [draft, setDraft] = useState<ServerSetupDraft>(() => ({
    ...prefillAddresses(initial, "http://localhost:8080"),
    analytics: true,
    ...draftPatch,
  }));
  const [openSection, setOpenSection] = useState<ExpandableSection | null>(
    () =>
      openAtStart === undefined ? initialOpenSection(step, draft) : openAtStart,
  );
  const steps = stepsFor(mode);
  const index = steps.indexOf(step);
  const Step = STEPS[step];
  return (
    <SetupScreen>
      <SetupStepFrame
        {...copy(step)}
        progress={
          index >= 0 ? { current: index + 1, total: steps.length } : undefined
        }
        onBack={index >= 0 ? () => {} : undefined}
        primaryLabel={primaryLabel}
        onPrimary={() => {}}
      >
        <Step
          draft={draft}
          initial={initial}
          update={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          errors={showErrors ? validateStep(step, draft, mode) : {}}
          mode={mode}
          usingDefaultCredentials={usingDefaultCredentials}
          openSection={openSection}
          setOpenSection={setOpenSection}
          saveSection={(section) =>
            setOpenSection(nextOpenSection(step, draft, section))
          }
        />
      </SetupStepFrame>
    </SetupScreen>
  );
}

/**
 * Each card of first-run server setup, rendered from the real step components
 * over a new server's defaults. Nothing is saved; Continue and Back do nothing.
 */
const meta = {
  title: "Server Setup/Steps",
  component: StepPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StepPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SigningIn: Story = {
  args: { step: "password" },
  render: () => <SetupSignInScreen />,
};

export const Account: Story = {
  args: {
    step: "password",
    usingDefaultCredentials: true,
    primaryLabel: "Save and continue",
  },
};

export const AccountMismatch: Story = {
  args: {
    ...Account.args,
    step: "password",
    draft: {
      adminUsername: "admin",
      newPassword: "adminadmin",
      confirmPassword: "adminadmi",
    },
    showErrors: true,
  },
};

export const QuickStart: Story = { args: { step: "summary", mode: "quick" } };

export const QuickStartEmailOn: Story = {
  args: { step: "summary", mode: "quick", draft: { emailEnabled: true } },
};

export const Addresses: Story = { args: { step: "addresses" } };

export const Language: Story = { args: { step: "language" } };

export const SignIn: Story = { args: { step: "signIn" } };

export const SignInOpenIdConnect: Story = {
  args: { step: "signIn", draft: { login: "oidc" } },
};

export const SignInMissingFields: Story = {
  args: { step: "signIn", draft: { login: "oidc" }, showErrors: true },
};

export const Email: Story = { args: { step: "email" } };

export const EmailOn: Story = {
  args: { step: "email", draft: { emailEnabled: true } },
};

export const Files: Story = { args: { step: "files" } };

export const FilesStorageTurnedOff: Story = {
  args: {
    step: "files",
    initial: { storageEnabled: true },
    draft: { storageEnabled: false, sharingEnabled: false },
  },
};

export const AiOff: Story = { args: { step: "ai", draft: { ai: "off" } } };

export const AiOwn: Story = { args: { step: "ai", draft: { ai: "custom" } } };

export const Analytics: Story = {
  args: { step: "analytics", primaryLabel: "Accept and finish" },
};
