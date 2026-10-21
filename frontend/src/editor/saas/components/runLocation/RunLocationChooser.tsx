import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@app/auth/ui/AuthShell";
import { Button } from "@app/ui/Button";
import { Icon, type IconName } from "@app/ui/Icon";
import { RunLocationStepLayout } from "@app/components/runLocation/RunLocationStepLayout";
import { AnimatedHeight } from "@app/components/runLocation/AnimatedHeight";
import { DesktopDownloadStep } from "@app/components/runLocation/DesktopDownloadStep";
import { SelfHostStep } from "@app/components/runLocation/SelfHostStep";
import { markRunLocationChosen } from "@app/components/runLocation/runLocationChosen";
import styles from "@app/components/runLocation/RunLocation.module.css";

type RunLocation = "browser" | "computer" | "server";

const CHOICES: {
  id: RunLocation;
  icon: IconName;
  title: string;
  description: string;
}[] = [
  {
    id: "browser",
    icon: "app-window",
    title: "In your browser",
    description: "The web app.",
  },
  {
    id: "computer",
    icon: "laptop",
    title: "On your computer",
    description: "The desktop app.",
  },
  {
    id: "server",
    icon: "server",
    title: "On your server",
    description: "Self-hosted, for a team.",
  },
];

interface RunLocationChooserProps {
  /** Leaves the chooser for the web app at the URL the visitor opened. */
  onContinueInBrowser: () => void;
}

/**
 * Asks where the visitor wants to run Stirling. Confirming any choice records
 * it as seen, whatever they then do on the desktop or server step.
 */
export function RunLocationChooser({
  onContinueInBrowser,
}: RunLocationChooserProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<RunLocation>("browser");
  const [confirmed, setConfirmed] = useState<RunLocation | null>(null);

  const confirm = () => {
    markRunLocationChosen();
    if (selected === "browser") {
      onContinueInBrowser();
      return;
    }
    setConfirmed(selected);
  };

  const back = () => setConfirmed(null);

  return (
    <AuthShell size={confirmed === "server" ? "wide" : "narrow"}>
      <AnimatedHeight>
        {confirmed === "computer" && <DesktopDownloadStep onBack={back} />}
        {confirmed === "server" && <SelfHostStep onBack={back} />}
        {confirmed === null && (
          <RunLocationStepLayout
            title={t("runLocation.title", "Where do you want to run Stirling?")}
            subtitle={t("runLocation.subtitle", "Choose where it runs.")}
          >
            <fieldset className={styles.choices}>
              <legend className="sr-only">
                {t("runLocation.title", "Where do you want to run Stirling?")}
              </legend>
              {CHOICES.map(({ id, icon, title, description }) => {
                const isSelected = selected === id;
                return (
                  <label
                    key={id}
                    className={[
                      styles.choice,
                      isSelected ? styles.choiceSelected : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <input
                      type="radio"
                      name="run-location"
                      value={id}
                      checked={isSelected}
                      onChange={() => setSelected(id)}
                      className={styles.choiceInput}
                    />
                    <span className={styles.choiceIcon} aria-hidden>
                      <Icon name={icon} size={24} />
                    </span>
                    <span className={styles.choiceText}>
                      <span className={styles.choiceTitle}>
                        {t(`runLocation.choice.${id}.title`, title)}
                      </span>
                      <span className={styles.choiceDesc}>
                        {t(`runLocation.choice.${id}.description`, description)}
                      </span>
                    </span>
                    <span className={styles.choiceDot} aria-hidden />
                  </label>
                );
              })}
            </fieldset>
            <Button variant="primary" fat fullWidth onClick={confirm}>
              {t("runLocation.continue", "Continue")}
            </Button>
          </RunLocationStepLayout>
        )}
      </AnimatedHeight>
    </AuthShell>
  );
}
