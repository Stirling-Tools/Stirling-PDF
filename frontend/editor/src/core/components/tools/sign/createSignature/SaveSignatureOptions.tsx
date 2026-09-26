import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@app/ui/Checkbox";
import { FormField } from "@app/ui/FormField";
import { Input } from "@app/ui/Input";
import { Select } from "@app/ui/Select";
import type {
  SaveChoice,
  SaveScope,
} from "@app/components/tools/sign/createSignature/types";
import styles from "@app/components/tools/sign/createSignature/SaveSignatureOptions.module.css";

export interface SaveOptionsState {
  enabled: boolean;
  label: string | null;
  scope: SaveScope;
  makeDefault: boolean;
}

export interface SaveLibraryLimits {
  canSave: boolean;
  maxLimit: number;
  canShare: boolean;
  browserStorage: boolean;
}

export function toSaveChoice(
  state: SaveOptionsState,
  defaultLabel: string,
  limits: SaveLibraryLimits,
): SaveChoice | null {
  if (!state.enabled || !limits.canSave) return null;
  return {
    label: state.label?.trim() || defaultLabel,
    scope: limits.canShare ? state.scope : "personal",
    makeDefault: state.makeDefault,
  };
}

function saveHint(t: TFunction, limits: SaveLibraryLimits): string {
  if (!limits.canSave) {
    return t(
      "sign.wallet.create.full",
      "Your library is full ({{max}} signatures). Delete one to save more.",
      { max: limits.maxLimit },
    );
  }
  if (limits.browserStorage) {
    return t(
      "sign.wallet.create.saveBrowserHint",
      "Kept in this browser, ready for next time.",
    );
  }
  return t("sign.wallet.create.saveHint", "Ready to reuse next time you sign.");
}

interface SaveSignatureOptionsProps {
  value: SaveOptionsState;
  onChange: (next: SaveOptionsState) => void;
  defaultLabel: string;
  limits: SaveLibraryLimits;
}

export function SaveSignatureOptions({
  value,
  onChange,
  defaultLabel,
  limits,
}: SaveSignatureOptionsProps) {
  const { t } = useTranslation();
  const update = (patch: Partial<SaveOptionsState>) =>
    onChange({ ...value, ...patch });
  const saving = value.enabled && limits.canSave;

  return (
    <div className={styles.box}>
      <Checkbox
        label={t("sign.wallet.create.save", "Save to my signatures")}
        description={saveHint(t, limits)}
        checked={saving}
        disabled={!limits.canSave}
        onChange={(event) => update({ enabled: event.currentTarget.checked })}
        data-testid="save-signature-checkbox"
      />
      {saving && (
        <div className={styles.fields}>
          <div className={styles.name}>
            <FormField label={t("sign.wallet.create.name", "Name")}>
              <Input
                value={value.label ?? defaultLabel}
                onChange={(event) =>
                  update({ label: event.currentTarget.value })
                }
                maxLength={60}
                data-testid="signature-name-input"
              />
            </FormField>
          </div>
          {limits.canShare && (
            <div className={styles.who}>
              <FormField label={t("sign.wallet.create.who", "Who can use it")}>
                <Select
                  value={value.scope}
                  onChange={(scope) =>
                    update({
                      scope: scope === "shared" ? "shared" : "personal",
                    })
                  }
                  options={[
                    {
                      value: "personal",
                      label: t("sign.wallet.create.whoMe", "Only me"),
                    },
                    {
                      value: "shared",
                      label: t("sign.wallet.create.whoEveryone", "Everyone"),
                    },
                  ]}
                />
              </FormField>
            </div>
          )}
          <Checkbox
            label={t("sign.wallet.create.makeDefault", "Make default")}
            checked={value.makeDefault}
            onChange={(event) =>
              update({ makeDefault: event.currentTarget.checked })
            }
          />
        </div>
      )}
    </div>
  );
}
