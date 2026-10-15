import { useTranslation } from "react-i18next";
import {
  OnOffControl,
  SettingRow,
  SetupNote,
  type SetupStepProps,
} from "@app/components/serverSetup/SetupFields";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

export function FilesStep({ draft, initial, update }: SetupStepProps) {
  const { t } = useTranslation();
  const storageLabel = t("serverSetup.files.storage", "Store files");
  const sharingLabel = t("serverSetup.files.sharing", "File sharing");
  const storageTurnedOff = initial.storageEnabled && !draft.storageEnabled;
  const sharingTurnedOff = initial.sharingEnabled && !draft.sharingEnabled;
  return (
    <>
      <SettingRow label={storageLabel}>
        {() => (
          <OnOffControl
            ariaLabel={storageLabel}
            value={draft.storageEnabled}
            onChange={(storageEnabled) =>
              update(
                storageEnabled
                  ? { storageEnabled }
                  : { storageEnabled, sharingEnabled: false },
              )
            }
          />
        )}
      </SettingRow>
      {draft.storageEnabled && (
        <SettingRow label={sharingLabel}>
          {() => (
            <OnOffControl
              ariaLabel={sharingLabel}
              value={draft.sharingEnabled}
              onChange={(sharingEnabled) => update({ sharingEnabled })}
            />
          )}
        </SettingRow>
      )}
      {(storageTurnedOff || sharingTurnedOff) && (
        <SetupNote tone="warning">
          <p className={styles.noteText}>
            {storageTurnedOff
              ? t(
                  "serverSetup.files.storageOffWarning",
                  "With storage off, files people saved on the server can no longer be opened.",
                )
              : t(
                  "serverSetup.files.sharingOffWarning",
                  "With sharing off, existing share links stop working.",
                )}
          </p>
        </SetupNote>
      )}
    </>
  );
}
