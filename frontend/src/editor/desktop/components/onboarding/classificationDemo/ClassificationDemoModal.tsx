/** Closing act of desktop onboarding: offers the default-PDF-app setting, then the
 *  Downloads sweep. Only asks — accepting hands the canvas to the sweep. Desktop only. */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import OnboardingSlideShell, {
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
import { useDefaultApp } from "@app/hooks/useDefaultApp";
import { startClassificationDemo } from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import {
  CLASSIFICATION_DEMO_BATCH_SIZE,
  resolveDownloadsDirectory,
} from "@app/components/onboarding/classificationDemo/classificationDemoSweep";
import {
  DefaultAppHero,
  FolderHero,
  PrivacyNote,
} from "@app/components/onboarding/classificationDemo/classificationDemoSlides";

type Stage = "default-app" | "offer";

interface ClassificationDemoModalProps {
  opened: boolean;
  onClose: () => void;
}

export function ClassificationDemoModal({
  opened,
  onClose,
}: ClassificationDemoModalProps) {
  const { t } = useTranslation();
  const { isDefault, isLoading, handleSetDefault } = useDefaultApp();
  const [stage, setStage] = useState<Stage | null>(null);
  // undefined until the OS answers; null means "no folder here". Distinguished so the
  // step count is not computed from a guess and then corrected a render later.
  const [directory, setDirectory] = useState<string | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!opened) return;
    let stopped = false;
    void resolveDownloadsDirectory()
      .then((dir) => {
        if (!stopped) setDirectory(dir);
      })
      .catch(() => {
        if (!stopped) setDirectory(null);
      });
    return () => {
      stopped = true;
    };
  }, [opened]);

  // Already the default handler: nothing to ask, so the flow opens on the folder offer.
  const needsDefaultApp = isDefault === false;
  const canSweep = directory !== null;
  const stages: Stage[] = [
    ...(needsDefaultApp ? (["default-app"] as const) : []),
    ...(canSweep ? (["offer"] as const) : []),
  ];
  const current = stage ?? stages[0] ?? "offer";
  const stepIndex = Math.max(stages.indexOf(current), 0);

  const advanceFromDefaultApp = () => {
    if (canSweep) {
      setStage("offer");
      return;
    }
    onClose();
  };

  /** Hand the canvas to the sweep and get out of its way. */
  const startSweep = () => {
    startClassificationDemo(CLASSIFICATION_DEMO_BATCH_SIZE);
    onClose();
  };

  const content = (): {
    hero: React.ReactNode;
    title: React.ReactNode;
    body: React.ReactNode;
    buttons: ShellButton[];
  } => {
    if (current === "default-app") {
      return {
        hero: <DefaultAppHero />,
        title: t(
          "classificationDemo.defaultApp.title",
          "Open every PDF in Stirling",
        ),
        body: t(
          "classificationDemo.defaultApp.body",
          "Make Stirling your default PDF app. Every PDF you open, from email, your browser, or your desktop, lands here, ready to read or edit. You can change this any time in Settings.",
        ),
        buttons: [
          {
            key: "default-skip",
            label: t("classificationDemo.buttons.notNow", "Not now"),
            action: "skip-default",
          },
          {
            key: "default-set",
            label: t(
              "classificationDemo.defaultApp.cta",
              "Make Stirling my default",
            ),
            primary: true,
            disabled: isLoading,
            action: "set-default",
          },
        ],
      };
    }

    return {
      hero: <FolderHero />,
      title: t(
        "classificationDemo.offer.title",
        "See what Stirling can do with a whole folder",
      ),
      body: (
        <div>
          <p>
            {t(
              "classificationDemo.offer.body",
              "Classify and organise the {{count}} most recent PDFs in your Downloads folder by type.",
              { count: CLASSIFICATION_DEMO_BATCH_SIZE },
            )}
          </p>
          <PrivacyNote />
        </div>
      ),
      buttons: [
        {
          key: "offer-skip",
          label: t("classificationDemo.buttons.skip", "Skip"),
          action: "close",
        },
        {
          key: "offer-start",
          label: t(
            "classificationDemo.offer.cta",
            "Process my Downloads folder",
          ),
          primary: true,
          action: "start",
        },
      ],
    };
  };

  const onAction = (action: string) => {
    switch (action) {
      case "set-default":
        void handleSetDefault().finally(advanceFromDefaultApp);
        return;
      case "skip-default":
        advanceFromDefaultApp();
        return;
      case "start":
        startSweep();
        return;
      case "close":
      default:
        onClose();
    }
  };

  // Both answers are needed before the first render: the step count depends on each, and
  // filling one in late slides a step in underneath the user.
  if (isDefault === null || directory === undefined) return null;
  // Nothing to offer on this machine (no default-app ask, no readable folder). Closing
  // rather than rendering null persists the seen flag, so it stops probing on every launch.
  if (stages.length === 0) {
    onClose();
    return null;
  }

  const slide = content();

  return (
    <OnboardingSlideShell
      opened={opened}
      hero={slide.hero}
      slideKey={current}
      title={slide.title}
      body={slide.body}
      stepIndex={stepIndex}
      stepCount={stages.length}
      buttons={slide.buttons}
      onAction={onAction}
      onClose={onClose}
    />
  );
}
