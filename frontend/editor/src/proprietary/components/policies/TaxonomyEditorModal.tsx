/**
 * Full-screen ("fat") editor for the classification taxonomy — the roomy view the
 * sidebar's Expand button opens. Hosts the {@link TaxonomyEditor} table plus an
 * Import/Export toolbar and a footer holding the destructive actions (reset /
 * start-from-scratch) and the Save/Cancel buttons. Editing is staged: nothing is
 * persisted until Save, which stays disabled until the draft actually changes.
 * The draft is owned by the caller so the sidebar summary reflects saved changes.
 */

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Modal } from "@shared/components/Modal";
import { Button } from "@shared/components/Button";
import { Banner } from "@shared/components/Banner";
import { TaxonomyEditor } from "@app/components/policies/TaxonomyEditor";
import type { ClassificationTaxonomy } from "@app/data/classificationTaxonomy";

interface TaxonomyEditorModalProps {
  open: boolean;
  onClose: () => void;
  draft: ClassificationTaxonomy;
  onDraftChange: (next: ClassificationTaxonomy) => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  /** Stage the built-in default into the draft. */
  onReset: () => void;
  /** Stage an empty taxonomy into the draft (build from scratch). */
  onClear: () => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  /** Save/reset (server) or import (file) failure to surface, if any. */
  error: string | null;
}

export function TaxonomyEditorModal({
  open,
  onClose,
  draft,
  onDraftChange,
  onImportFile,
  onExport,
  onReset,
  onClear,
  onSave,
  dirty,
  saving,
  readOnly,
  error,
}: TaxonomyEditorModalProps) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = "";
    if (file) onImportFile(file);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      className="tax-modal"
      title={t("policies.taxonomy.modalTitle", "Classification taxonomy")}
      subtitle={t(
        "policies.taxonomy.modalSubtitle",
        "Shared with your whole team. Categories, their sub-categories, and tags the classifier uses.",
      )}
      footer={
        <div className="tax-footer">
          <div className="tax-footer-left">
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  accent="red"
                  size="sm"
                  leadingIcon={
                    <DeleteSweepOutlinedIcon sx={{ fontSize: "1rem" }} />
                  }
                  onClick={onClear}
                  disabled={saving}
                >
                  {t(
                    "policies.taxonomy.startFromScratch",
                    "Start from scratch",
                  )}
                </Button>
                <Button
                  variant="ghost"
                  accent="red"
                  size="sm"
                  leadingIcon={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
                  onClick={onReset}
                  disabled={saving}
                >
                  {t("policies.taxonomy.resetToDefault", "Reset to default")}
                </Button>
              </>
            )}
          </div>
          <div className="tax-footer-right">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {readOnly ? t("close", "Close") : t("cancel", "Cancel")}
            </Button>
            {!readOnly && (
              <Button
                variant="gradient"
                size="sm"
                onClick={onSave}
                disabled={!dirty || saving}
              >
                {saving
                  ? t("policies.taxonomy.saving", "Saving…")
                  : t("policies.taxonomy.saveForTeam", "Save for team")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="tax-modal-body">
        {error && (
          <Banner
            tone="danger"
            icon={<InfoOutlinedIcon sx={{ fontSize: "1rem" }} />}
            description={error}
          />
        )}
        {!readOnly && (
          <div className="tax-toolbar">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<FileUploadOutlinedIcon sx={{ fontSize: "1rem" }} />}
              onClick={() => fileInput.current?.click()}
            >
              {t("policies.taxonomy.import", "Import JSON")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={
                <FileDownloadOutlinedIcon sx={{ fontSize: "1rem" }} />
              }
              onClick={onExport}
            >
              {t("policies.taxonomy.export", "Export JSON")}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={handleFile}
            />
          </div>
        )}
        <TaxonomyEditor
          value={draft}
          onChange={onDraftChange}
          readOnly={readOnly}
        />
      </div>
    </Modal>
  );
}
