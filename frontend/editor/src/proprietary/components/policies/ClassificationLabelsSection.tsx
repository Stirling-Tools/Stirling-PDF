/**
 * The Classification policy's team-labels control, shown in its Edit-Settings
 * view: a compact summary (count + chips) with an Expand button that opens the
 * fat {@link LabelsEditorModal}. Team-shared; only users who can configure
 * policies may edit it. Owns the editable draft and the load/save/import/export
 * wiring via {@link useClassificationLabels}.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Card } from "@app/ui/Card";
import { Button } from "@app/ui/Button";
import { Chip } from "@app/ui/Chip";
import { Banner } from "@app/ui/Banner";
import { useClassificationLabels } from "@app/hooks/useClassificationLabels";
import { LabelsEditorModal } from "@app/components/policies/LabelsEditorModal";
import {
  downloadLabels,
  parseLabelsFile,
  validateLabels,
} from "@app/services/labelsFile";
import {
  DEFAULT_CLASSIFICATION_LABELS,
  type ClassificationLabel,
} from "@app/data/classificationLabels";
import "@app/components/policies/LabelsEditor.css";

/** Chips shown in the collapsed team summary before it gets noisy. */
const SUMMARY_CHIP_COUNT = 12;

interface ClassificationLabelsSectionProps {
  canConfigure: boolean;
}

export function ClassificationLabelsSection({
  canConfigure,
}: ClassificationLabelsSectionProps) {
  const { t } = useTranslation();
  const { teamLabels, isCustom, loading, saving, error, saveTeam } =
    useClassificationLabels(true);

  const [draft, setDraft] = useState<ClassificationLabel[]>(teamLabels);
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync the draft to server truth whenever it changes (load / save / reset).
  // Local edits don't change `teamLabels`, so this never clobbers them mid-edit.
  useEffect(() => setDraft(teamLabels), [teamLabels]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(teamLabels),
    [draft, teamLabels],
  );

  const close = () => {
    setDraft(teamLabels);
    setLocalError(null);
    setOpen(false);
  };

  const onImportFile = (file: File) => {
    setLocalError(null);
    void parseLabelsFile(file)
      .then(setDraft)
      .catch((e: unknown) =>
        setLocalError(
          e instanceof Error
            ? e.message
            : t("policies.labels.importError", "Couldn't import that file."),
        ),
      );
  };

  const onSave = () => {
    const errors = validateLabels({ labels: draft });
    if (errors.length > 0) {
      setLocalError(errors[0]);
      return;
    }
    setLocalError(null);
    void saveTeam(draft).then(() => setOpen(false));
  };

  return (
    <div className="labels-summary">
      <p className="pol-section-label">
        {t("policies.labels.sectionLabel", "Classification labels")}
      </p>
      <Card>
        {loading ? (
          <span className="labels-empty">{t("loading", "Loading…")}</span>
        ) : (
          <div className="labels-summary">
            <div className="labels-summary-stats">
              <span>
                <strong>{teamLabels.length}</strong>{" "}
                {t("policies.labels.teamCount", "team labels")}
              </span>
            </div>
            <div className="labels-chips">
              {teamLabels.slice(0, SUMMARY_CHIP_COUNT).map((label) => (
                <Chip key={label.id} accent="neutral" size="sm">
                  {label.name}
                </Chip>
              ))}
              {teamLabels.length > SUMMARY_CHIP_COUNT && (
                <Chip accent="neutral" size="sm">
                  +{teamLabels.length - SUMMARY_CHIP_COUNT}
                </Chip>
              )}
            </div>
            <span className="labels-summary-note">
              {isCustom
                ? t("policies.labels.customNote", "Customized for your team.")
                : t(
                    "policies.labels.defaultNote",
                    "Using the built-in default, shared with your team.",
                  )}
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftSection={<OpenInFullIcon sx={{ fontSize: "1rem" }} />}
              onClick={() => setOpen(true)}
              style={{ alignSelf: "flex-start" }}
            >
              {canConfigure
                ? t("policies.labels.edit", "Edit labels")
                : t("policies.labels.view", "View labels")}
            </Button>
          </div>
        )}
      </Card>

      {!canConfigure && (
        <Banner
          tone="neutral"
          icon={<LockOutlinedIcon sx={{ fontSize: "1rem" }} />}
          description={t(
            "policies.labels.managedNote",
            "Team labels are managed by your team leader.",
          )}
        />
      )}

      {error && !open && <Banner tone="danger" description={error} />}

      <LabelsEditorModal
        open={open}
        onClose={close}
        draft={draft}
        onDraftChange={setDraft}
        onImportFile={onImportFile}
        onExport={() => downloadLabels(draft)}
        onReset={() => {
          // Stage the built-in default into the draft — reversible via Cancel,
          // only persisted on Save (no immediate destructive server delete).
          setLocalError(null);
          setDraft(DEFAULT_CLASSIFICATION_LABELS);
        }}
        onClear={() => {
          // Stage an empty list to build from scratch — also reversible until Save.
          setLocalError(null);
          setDraft([]);
        }}
        onSave={onSave}
        dirty={dirty}
        saving={saving}
        readOnly={!canConfigure}
        error={localError ?? error}
      />
    </div>
  );
}
