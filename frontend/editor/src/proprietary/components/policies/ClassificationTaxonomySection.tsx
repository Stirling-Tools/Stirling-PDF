/**
 * The Classification policy's taxonomy control, shown in its Edit-Settings view.
 * Renders a compact summary (counts + category chips) with an Expand button that
 * opens the fat {@link TaxonomyEditorModal}. Owns the editable draft and the
 * load/save/reset/import/export wiring via {@link useClassificationTaxonomy}. The
 * taxonomy is team-shared; only users who can configure policies may edit it.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { Chip } from "@shared/components/Chip";
import { Banner } from "@shared/components/Banner";
import { useClassificationTaxonomy } from "@app/hooks/useClassificationTaxonomy";
import { TaxonomyEditorModal } from "@app/components/policies/TaxonomyEditorModal";
import {
  downloadTaxonomy,
  parseTaxonomyFile,
  validateTaxonomy,
} from "@app/services/taxonomyFile";
import {
  DEFAULT_CLASSIFICATION_TAXONOMY,
  type ClassificationTaxonomy,
} from "@app/data/classificationTaxonomy";
import "@app/components/policies/TaxonomyEditor.css";

interface ClassificationTaxonomySectionProps {
  canConfigure: boolean;
}

export function ClassificationTaxonomySection({
  canConfigure,
}: ClassificationTaxonomySectionProps) {
  const { t } = useTranslation();
  const { taxonomy, isCustom, loading, saving, error, save } =
    useClassificationTaxonomy(true);

  const [draft, setDraft] = useState<ClassificationTaxonomy>(taxonomy);
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync the draft to server truth whenever it changes (load / save / reset).
  // Local edits don't change `taxonomy`, so this never clobbers them mid-edit.
  useEffect(() => setDraft(taxonomy), [taxonomy]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(taxonomy),
    [draft, taxonomy],
  );

  const subCount = useMemo(
    () => taxonomy.categories.reduce((n, c) => n + c.docTypes.length, 0),
    [taxonomy],
  );

  const close = () => {
    setDraft(taxonomy);
    setLocalError(null);
    setOpen(false);
  };

  const onImportFile = (file: File) => {
    setLocalError(null);
    void parseTaxonomyFile(file)
      .then(setDraft)
      .catch((e: unknown) =>
        setLocalError(
          e instanceof Error
            ? e.message
            : t("policies.taxonomy.importError", "Couldn't import that file."),
        ),
      );
  };

  const onSave = () => {
    const errors = validateTaxonomy(draft);
    if (errors.length > 0) {
      setLocalError(errors[0]);
      return;
    }
    setLocalError(null);
    void save(draft).then(() => setOpen(false));
  };

  return (
    <div className="tax-summary">
      <p className="pol-section-label">
        {t("policies.taxonomy.sectionLabel", "Classification taxonomy")}
      </p>
      <Card>
        {loading ? (
          <span className="tax-empty">{t("loading", "Loading…")}</span>
        ) : (
          <div className="tax-summary">
            <div className="tax-summary-stats">
              <span>
                <strong>{taxonomy.categories.length}</strong>{" "}
                {t("policies.taxonomy.categories", "categories")}
              </span>
              <span>
                <strong>{subCount}</strong>{" "}
                {t("policies.taxonomy.subCategories", "sub-categories")}
              </span>
              <span>
                <strong>{taxonomy.tags.length}</strong>{" "}
                {t("policies.taxonomy.tags", "tags")}
              </span>
            </div>
            <div className="tax-summary-cats">
              {taxonomy.categories.map((c) => (
                <Chip key={c.id} tone="neutral" size="sm">
                  {c.label}
                </Chip>
              ))}
            </div>
            <span className="tax-empty">
              {isCustom
                ? t("policies.taxonomy.customNote", "Customized for your team.")
                : t(
                    "policies.taxonomy.defaultNote",
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
                ? t("policies.taxonomy.edit", "Edit taxonomy")
                : t("policies.taxonomy.view", "View taxonomy")}
            </Button>
          </div>
        )}
      </Card>

      {!canConfigure && (
        <Banner
          tone="neutral"
          icon={<LockOutlinedIcon sx={{ fontSize: "1rem" }} />}
          description={t(
            "policies.taxonomy.managedNote",
            "The taxonomy is managed by your team leader.",
          )}
        />
      )}

      <TaxonomyEditorModal
        open={open}
        onClose={close}
        draft={draft}
        onDraftChange={setDraft}
        onImportFile={onImportFile}
        onExport={() => downloadTaxonomy(draft)}
        onReset={() => {
          // Stage the built-in default into the draft — reversible via Cancel,
          // only persisted on Save (no immediate destructive server delete).
          setLocalError(null);
          setDraft(DEFAULT_CLASSIFICATION_TAXONOMY);
        }}
        onClear={() => {
          // Stage an empty taxonomy to build from scratch — also reversible until Save.
          setLocalError(null);
          setDraft({ categories: [], tags: [] });
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
