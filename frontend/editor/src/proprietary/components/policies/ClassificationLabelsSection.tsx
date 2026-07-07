/**
 * The Classification policy's labels control, shown in its Edit-Settings view.
 * Two blocks:
 *  - TEAM labels — a compact summary (count + chips) with an Expand button that
 *    opens the fat {@link LabelsEditorModal}. Team-shared; only users who can
 *    configure policies may edit it. Owns the editable draft and the
 *    load/save/import/export wiring via {@link useClassificationLabels}.
 *  - MY labels — the calling user's personal, additive labels; editable by
 *    anyone, applied only to their own classification runs. Saved immediately.
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
import { LabelsEditor } from "@app/components/policies/LabelsEditor";
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
  const {
    teamLabels,
    isCustom,
    myLabels,
    loading,
    saving,
    error,
    saveTeam,
    saveMine,
  } = useClassificationLabels(true);

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

  // Personal labels save immediately on change — they're the user's own, so
  // there's no draft/approval step; failures surface via the shared error.
  const onMyLabelsChange = (next: ClassificationLabel[]) => {
    void saveMine(next).catch(() => {
      // error state set by the hook; the list re-syncs from server truth.
    });
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
                <Chip key={label.name} tone="neutral" size="sm">
                  {label.name}
                </Chip>
              ))}
              {teamLabels.length > SUMMARY_CHIP_COUNT && (
                <Chip tone="neutral" size="sm">
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
              variant="outline"
              size="sm"
              leadingIcon={<OpenInFullIcon sx={{ fontSize: "1rem" }} />}
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

      <p className="pol-section-label">
        {t("policies.labels.mineLabel", "My labels")}
      </p>
      <Card>
        <div className="labels-summary">
          <span className="labels-summary-note">
            {t(
              "policies.labels.mineNote",
              "Personal labels only you see — applied on top of the team set when your documents are classified.",
            )}
          </span>
          <LabelsEditor
            value={myLabels}
            onChange={onMyLabelsChange}
            readOnly={saving}
            reservedNames={teamLabels.map((label) => label.name)}
            addPlaceholder={t(
              "policies.labels.mineAddPlaceholder",
              "Add a personal label…",
            )}
            emptyText={t(
              "policies.labels.mineEmpty",
              "No personal labels yet.",
            )}
          />
        </div>
      </Card>

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
