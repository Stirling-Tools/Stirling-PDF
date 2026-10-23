import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Select } from "@editor/ui/Select";
import { RunLocationStepLayout } from "@editor/components/runLocation/RunLocationStepLayout";
import {
  DESKTOP_TARGETS,
  detectDesktopTarget,
  getDesktopTarget,
  type DesktopTargetId,
} from "@editor/components/runLocation/desktopTargets";
import { startDownload } from "@editor/components/runLocation/startDownload";
import styles from "@editor/components/runLocation/RunLocation.module.css";

interface DesktopDownloadStepProps {
  onBack: () => void;
}

export function DesktopDownloadStep({ onBack }: DesktopDownloadStepProps) {
  const { t } = useTranslation();
  const [targetId, setTargetId] = useState<DesktopTargetId>("mac");
  const [userPicked, setUserPicked] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (userPicked) return;
    let cancelled = false;
    void detectDesktopTarget().then((detected) => {
      if (!cancelled) setTargetId(detected);
    });
    return () => {
      cancelled = true;
    };
  }, [userPicked]);

  const target = getDesktopTarget(targetId);
  const platformName = t(
    `runLocation.desktop.platform.${target.platform}`,
    target.platform,
  );

  const options = DESKTOP_TARGETS.map(({ id }) => ({
    value: id,
    label: t(`runLocation.desktop.target.${id}`, id),
  }));

  const download = () => {
    if (target.guide) {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }
    startDownload(target.url);
    setDownloaded(true);
  };

  return (
    <RunLocationStepLayout
      onBack={onBack}
      title={
        downloaded
          ? t("runLocation.desktop.startedTitle", "Your download has started")
          : t("runLocation.desktop.title", "Get the desktop app")
      }
      subtitle={
        downloaded
          ? t(
              "runLocation.desktop.startedSubtitle",
              "Check your Downloads folder, then open the installer.",
            )
          : t("runLocation.desktop.subtitle", "Download it and open it.")
      }
    >
      <div className={styles.settingRow}>
        <span className={styles.settingLabel} id="run-location-computer">
          {t("runLocation.desktop.computerLabel", "Your computer")}
        </span>
        <div className={styles.settingControl}>
          <Select
            aria-labelledby="run-location-computer"
            options={options}
            value={targetId}
            onChange={(value) => {
              if (!value) return;
              setUserPicked(true);
              setTargetId(value as DesktopTargetId);
              setDownloaded(false);
            }}
          />
        </div>
      </div>
      <Button
        variant={downloaded ? "secondary" : "primary"}
        fat
        fullWidth
        leftSection={
          <Icon name={target.guide ? "external-link" : "download"} size={18} />
        }
        onClick={download}
      >
        {target.guide
          ? t(
              "runLocation.desktop.guide",
              "Open the {{platform}} install guide",
              {
                platform: platformName,
              },
            )
          : downloaded
            ? t("runLocation.desktop.downloadAgain", "Download again")
            : t("runLocation.desktop.download", "Download for {{platform}}", {
                platform: platformName,
              })}
      </Button>
    </RunLocationStepLayout>
  );
}
