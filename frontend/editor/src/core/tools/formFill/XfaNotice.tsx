/**
 * Warns that a PDF is a hybrid XFA form, whose XFA half Acrobat shows instead of the fields every
 * other viewer shows, and lets the user choose what saving does to it. Renders nothing for other
 * PDFs.
 */
import { Alert, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Banner } from "@app/ui/Banner";
import { Icon } from "@app/ui/Icon";
import { RadioGroup } from "@app/ui/Radio";
import { Select } from "@app/ui/Select";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import { useXfaKind, type XfaMode } from "@app/tools/formFill/xfa";

interface XfaNoticeProps {
  file: File | Blob | null;
  /** panel: the tool's side panel, every option explained; compact: the viewer's save bar. */
  variant: "panel" | "compact";
  /**
   * structure: the panel commits added, changed or deleted fields, which the XFA template cannot
   * describe, so a save can only remove the XFA or leave it untouched.
   */
  scope?: "values" | "structure";
}

interface ModeOption {
  value: XfaMode;
  label: string;
  description: string;
}

export function XfaNotice({ file, variant, scope = "values" }: XfaNoticeProps) {
  const { t } = useTranslation();
  const { state, xfaMode, setXfaMode, xfaSyncFailed, clearXfaSyncFailed } =
    useFormFill();
  const kind = useXfaKind(file, state.fields.length);

  if (kind === "none") return null;

  if (kind === "dynamic") {
    return (
      <div data-testid="xfa-notice-dynamic">
        <Banner
          tone="warning"
          icon={<Icon name="triangle-alert" size={16} />}
          title={t("formFill.xfa.dynamicTitle", "Dynamic XFA form")}
          description={t(
            "formFill.xfa.dynamicDescription",
            "This form is built entirely in XFA and has no fields other viewers can fill. Only Adobe Acrobat or Reader can fill it.",
          )}
        />
      </div>
    );
  }

  const structure = scope === "structure";
  const options: ModeOption[] = structure
    ? [
        {
          value: "sync",
          label: t("formFill.xfa.structure.remove", "Remove XFA (recommended)"),
          description: t(
            "formFill.xfa.structure.removeDescription",
            "Its template cannot describe added, changed or deleted fields, so it has to go for Acrobat to show the new form.",
          ),
        },
        {
          value: "none",
          label: t("formFill.xfa.mode.none", "Leave untouched"),
          description: t(
            "formFill.xfa.structure.noneDescription",
            "Acrobat keeps showing the form as it was before these changes.",
          ),
        },
      ]
    : [
        {
          value: "sync",
          label: t("formFill.xfa.mode.sync", "Sync XFA (recommended)"),
          description: t(
            "formFill.xfa.mode.syncDescription",
            "Copy the values into the XFA data, so Acrobat shows the same as every other viewer.",
          ),
        },
        {
          value: "strip",
          label: t("formFill.xfa.mode.strip", "Remove XFA"),
          description: t(
            "formFill.xfa.mode.stripDescription",
            "Every viewer, Acrobat included, uses the regular fields. The form's LiveCycle scripts and checks stop working.",
          ),
        },
        {
          value: "none",
          label: t("formFill.xfa.mode.none", "Leave untouched"),
          description: t(
            "formFill.xfa.mode.noneDescription",
            "Keep the XFA data as it is. Acrobat will go on showing its old values.",
          ),
        },
      ];

  // Sync and strip both remove the XFA on a structural save, so either shows as "remove".
  const selected: XfaMode = structure && xfaMode === "strip" ? "sync" : xfaMode;
  const choose = (mode: XfaMode) => {
    clearXfaSyncFailed();
    if (structure && mode === "sync" && xfaMode === "strip") return;
    setXfaMode(mode);
  };

  return (
    <div data-testid="xfa-notice">
      <Banner
        tone="warning"
        icon={<Icon name="triangle-alert" size={16} />}
        title={t(
          "formFill.xfa.hybridTitle",
          "Hybrid XFA form: Acrobat data may differ",
        )}
        description={
          structure
            ? t(
                "formFill.xfa.structureDescription",
                "Adobe Acrobat shows this form's XFA version, which cannot follow changes to its fields.",
              )
            : t(
                "formFill.xfa.hybridDescription",
                "Adobe Acrobat shows this form's XFA data instead of the fields you fill here.",
              )
        }
      >
        {variant === "panel" ? (
          <RadioGroup
            name="xfa-save-mode"
            value={selected}
            onChange={choose}
            options={options}
          />
        ) : (
          <Select
            inputSize="sm"
            options={options.map(({ value, label }) => ({ value, label }))}
            value={selected}
            onChange={(value) => {
              if (value) choose(value as XfaMode);
            }}
            aria-label={t(
              "formFill.xfa.modeLabel",
              "What saving does to the XFA",
            )}
          />
        )}
      </Banner>
      {xfaSyncFailed && (
        <Alert
          icon={<Icon name="triangle-alert" size={16} />}
          color="red"
          variant="light"
          p="xs"
          radius="sm"
          mt="xs"
          data-testid="xfa-sync-failed"
        >
          <Text size="xs">
            {t(
              "formFill.xfa.syncFailed",
              "The XFA data could not be updated, so Acrobat may still show the old values in the saved PDF.",
            )}
          </Text>
        </Alert>
      )}
    </div>
  );
}

export default XfaNotice;
