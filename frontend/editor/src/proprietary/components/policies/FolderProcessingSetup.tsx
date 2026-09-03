import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@mantine/core";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LayersClearOutlinedIcon from "@mui/icons-material/LayersClearOutlined";
import CompressIcon from "@mui/icons-material/Compress";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import { folderKind } from "@app/types/folder";
import {
  saveProcessingFolder,
  type ProcessingFolderStep,
} from "@app/services/processingFolderApi";
import { refreshProcessingFolders } from "@app/hooks/useProcessingFolders";
import { deliverSweepResults } from "@app/services/processingRunDelivery";
import { useFileHandler } from "@app/hooks/useFileHandler";
import type { FolderProcessingSetupProps } from "@core/components/policies/FolderProcessingSetup";
import "@app/components/policies/FolderProcessingSetup.css";

export type { FolderProcessingSetupProps };

interface RecipeStep extends ProcessingFolderStep {
  /** Menu label for the toggle row. */
  label: string;
  hint: string;
  enabled: boolean;
}

interface Recipe {
  id: string;
  Icon: typeof LabelOutlinedIcon;
  title: string;
  blurb: string;
  steps: RecipeStep[];
}

/**
 * Ready-made starting points, mirroring the Pipelines templates gallery in
 * miniature. Each is just a preset step chain over the chosen folder; the step
 * toggles below let the user trim a recipe without leaving the dialog.
 */
const RECIPES: Recipe[] = [
  {
    id: "classify",
    Icon: LabelOutlinedIcon,
    title: "Classify & organise",
    blurb:
      "Identify each document's type and label it, so the folder sorts itself.",
    steps: [
      {
        operation: "/api/v1/ai/tools/classify-and-label",
        parameters: {},
        assets: {},
        label: "Classify & label",
        hint: "Tag each document's type",
        enabled: true,
      },
    ],
  },
  {
    id: "flatten",
    Icon: LayersClearOutlinedIcon,
    title: "Flatten & classify",
    blurb: "Bake forms and annotations into the page, then label the result.",
    steps: [
      {
        operation: "/api/v1/misc/flatten",
        parameters: { flattenOnlyForms: false },
        assets: {},
        label: "Flatten",
        hint: "Forms and annotations become part of the page",
        enabled: true,
      },
      {
        operation: "/api/v1/ai/tools/classify-and-label",
        parameters: {},
        assets: {},
        label: "Classify & label",
        hint: "Tag each document's type",
        enabled: true,
      },
    ],
  },
  {
    id: "compress",
    Icon: CompressIcon,
    title: "Shrink everything",
    blurb: "Compress arrivals to a balanced size. Originals stay untouched.",
    steps: [
      {
        operation: "/api/v1/misc/compress-pdf",
        parameters: { optimizeLevel: 5 },
        assets: {},
        label: "Compress",
        hint: "Balanced quality, smaller files",
        enabled: true,
      },
    ],
  },
];

/**
 * The setup dialog behind "Process files in this folder": pick a recipe, trim
 * its steps, start. A miniature of the Pipelines create flow (templates into
 * guided setup), scoped to one folder; the full builder stays the pro lens.
 */
export function FolderProcessingSetup({
  folder,
  onClose,
}: FolderProcessingSetupProps) {
  const { t } = useTranslation();
  const { addFiles } = useFileHandler();
  const [recipeId, setRecipeId] = useState(RECIPES[0].id);
  const [steps, setSteps] = useState<RecipeStep[]>(RECIPES[0].steps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh dialog per folder: reopening never inherits the last run's trimming.
  useEffect(() => {
    if (!folder) return;
    setRecipeId(RECIPES[0].id);
    setSteps(RECIPES[0].steps);
    setBusy(false);
    setError(null);
  }, [folder]);

  if (!folder) return null;

  const pickRecipe = (recipe: Recipe) => {
    setRecipeId(recipe.id);
    setSteps(recipe.steps.map((step) => ({ ...step })));
  };

  const start = async () => {
    const active = steps.filter((step) => step.enabled);
    if (active.length === 0) return;
    setBusy(true);
    setError(null);
    const wire = active.map(({ operation, parameters, assets }) => ({
      operation,
      parameters,
      assets,
    }));
    const onDisk = folderKind(folder) === "local";
    try {
      const saved = await saveProcessingFolder(
        onDisk
          ? { directory: folder.directory ?? "", enabled: true, steps: wire }
          : {
              folderId: folder.id as string,
              enabled: true,
              steps: wire,
              output: { mode: "new_version" },
            },
      );
      void refreshProcessingFolders();
      // A mount's results land on disk where nothing shows them; pull them
      // into the workbench as they settle. Storage results replace in place.
      if (onDisk && saved.startedRuns > 0) {
        void deliverSweepResults(saved.id, saved.startedRuns, addFiles);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      width="md"
      title={
        <span className="folder-setup__title">
          <AutoModeIcon fontSize="small" />
          {t("filesPage.processingSetup.title", "Process “{{name}}”", {
            name: folder.name,
          })}
        </span>
      }
      footer={
        <div className="folder-setup__foot">
          <Button
            variant="tertiary"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {t("filesPage.processingSetup.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void start()}
            loading={busy}
            disabled={busy || steps.every((step) => !step.enabled)}
          >
            {t("filesPage.processingSetup.start", "Start processing")}
          </Button>
        </div>
      }
    >
      <div className="folder-setup__body">
        <p className="folder-setup__lead">
          {t(
            "filesPage.processingSetup.lead",
            "Anything added to this folder runs these steps. Originals are never changed.",
          )}
        </p>
        <div className="folder-setup__recipes">
          {RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={`folder-setup__recipe${recipeId === recipe.id ? " is-selected" : ""}`}
              onClick={() => pickRecipe(recipe)}
            >
              <span className="folder-setup__recipe-icon">
                <recipe.Icon fontSize="small" />
              </span>
              <span className="folder-setup__recipe-name">
                {t(
                  `filesPage.processingSetup.recipes.${recipe.id}`,
                  recipe.title,
                )}
              </span>
              <span className="folder-setup__recipe-blurb">
                {t(
                  `filesPage.processingSetup.recipes.${recipe.id}Blurb`,
                  recipe.blurb,
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="folder-setup__steps">
          {steps.map((step, index) => (
            <div key={step.operation + index} className="folder-setup__step">
              <span className="folder-setup__step-label">
                <span>{step.label}</span>
                <small>{step.hint}</small>
              </span>
              <Switch
                size="sm"
                checked={step.enabled}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked;
                  setSteps((prev) =>
                    prev.map((s, i) => (i === index ? { ...s, enabled } : s)),
                  );
                }}
                aria-label={step.label}
              />
            </div>
          ))}
        </div>
        {error && <p className="folder-setup__error">{error}</p>}
      </div>
    </Modal>
  );
}
