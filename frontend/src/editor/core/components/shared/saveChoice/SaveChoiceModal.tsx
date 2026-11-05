import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@editor/ui/Modal";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { RadioGroup } from "@editor/ui/Radio";
import {
  answerSaveChoice,
  getSaveChoice,
  subscribeSaveChoice,
  type SaveChoice,
} from "@editor/services/saveChoice";

/** The "Ask me" dialog: where this Save goes. */
export function SaveChoiceModal() {
  const { t } = useTranslation();
  const request = useSyncExternalStore(subscribeSaveChoice, getSaveChoice);
  const [choice, setChoice] = useState<SaveChoice>("replace");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!request) return;
    setChoice("replace");
    setRemember(false);
  }, [request]);

  const cancel = () => answerSaveChoice(null);
  const home = request?.homeName ?? "";

  return (
    <Modal
      open={request !== null}
      onClose={cancel}
      width="sm"
      title={t("saveFile.ask.title", 'Save "{{name}}"', {
        name: request?.fileName ?? "",
      })}
      footer={
        <>
          <Button variant="secondary" onClick={cancel}>
            {t("cancel", "Cancel")}
          </Button>
          <Button onClick={() => answerSaveChoice({ choice, remember })}>
            {t("save", "Save")}
          </Button>
        </>
      }
    >
      <RadioGroup<SaveChoice>
        name="save-choice"
        value={choice}
        onChange={setChoice}
        options={[
          {
            value: "replace",
            label: t("saveFile.ask.replace", "Update the original"),
            description: t("saveFile.ask.replaceHint", "Replaces it in {{home}}.", {
              home,
            }),
          },
          {
            value: "copy",
            label: t("saveFile.ask.copy", "Save a copy next to it"),
            description: t(
              "saveFile.ask.copyHint",
              "Saves {{name}} in {{home}}. Later saves update that copy.",
              { name: request?.copyName ?? "", home },
            ),
          },
          {
            value: "other",
            label: request?.otherLabel ?? "",
            description: t("saveFile.ask.otherHint", "Leaves {{home}} untouched.", {
              home,
            }),
          },
        ]}
      />
      {request?.canRemember && (
        <Checkbox
          label={t("saveFile.ask.remember", "Remember my choice")}
          description={t(
            "saveFile.ask.rememberHint",
            "Change it later in Settings > Preferences.",
          )}
          checked={remember}
          onChange={(event) => setRemember(event.currentTarget.checked)}
          style={{ marginTop: "1rem" }}
        />
      )}
    </Modal>
  );
}
