/**
 * Full-screen ("fat") editor for the team's classification labels — the roomy
 * view the settings summary's Edit button opens. Hosts the {@link LabelsEditor}
 * chip grid plus an Import/Export toolbar and a footer holding the destructive
 * actions (reset / start-from-scratch) and the Save/Cancel buttons. Editing is
 * staged: nothing is persisted until Save, which stays disabled until the draft
 * actually changes. The draft is owned by the caller so the settings summary
 * reflects saved changes.
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
import { LabelsEditor } from "@app/components/policies/LabelsEditor";
import type { ClassificationLabel } from "@app/data/classificationLabels";

interface LabelsEditorModalProps {
  open: boolean;
  onClose: () => void;
  draft: ClassificationLabel[];
  onDraftChange: (next: ClassificationLabel[]) => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  /** Stage the built-in default into the draft. */
  onReset: () => void;
  /** Stage an empty list into the draft (build from scratch). */
  onClear: () => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  /** Save (server) or import (file) failure to surface, if any. */
  error: string | null;
}

export function LabelsEditorModal({
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
}: LabelsEditorModalProps) {
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
      className="labels-modal"
      title={t("policies.labels.modalTitle", "Classification labels")}
      subtitle={t(
        "policies.labels.modalSubtitle",
        "Shared with your whole team. The classifier picks the labels that fit each document.",
      )}
      footer={
        <div className="labels-footer">
          <div className="labels-footer-left">
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
                  {t("policies.labels.startFromScratch", "Start from scratch")}
                </Button>
                <Button
                  variant="ghost"
                  accent="red"
                  size="sm"
                  leadingIcon={<RestartAltIcon sx={{ fontSize: "1rem" }} />}
                  onClick={onReset}
                  disabled={saving}
                >
                  {t("policies.labels.resetToDefault", "Reset to default")}
                </Button>
              </>
            )}
          </div>
          <div className="labels-footer-right">
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
                  ? t("policies.labels.saving", "Saving…")
                  : t("policies.labels.saveForTeam", "Save for team")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="labels-modal-body">
        {error && (
          <Banner
            tone="danger"
            icon={<InfoOutlinedIcon sx={{ fontSize: "1rem" }} />}
            description={error}
          />
        )}
        {!readOnly && (
          <div className="labels-toolbar">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<FileUploadOutlinedIcon sx={{ fontSize: "1rem" }} />}
              onClick={() => fileInput.current?.click()}
            >
              {t("policies.labels.import", "Import JSON")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leadingIcon={
                <FileDownloadOutlinedIcon sx={{ fontSize: "1rem" }} />
              }
              onClick={onExport}
            >
              {t("policies.labels.export", "Export JSON")}
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
        <LabelsEditor
          value={draft}
          onChange={onDraftChange}
          readOnly={readOnly}
        />
      </div>
    </Modal>
  );
}
