import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  FormField,
  Input,
  Select,
  SegmentedControl,
} from "@app/ui";
import { Icon } from "@app/ui/Icon";
import { folderKind, type FolderRecord } from "@app/types/folder";
import type { PickedDirectory } from "@app/services/directoryPicker";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import {
  processingFolderPath,
  type ProcessingFolderTarget,
} from "@app/components/policies/processingFolderSetup";

export interface ProcessingFolderPickerProps {
  folders: FolderRecord[];
  canPickDirectory: boolean;
  serverDisabledReason: string | null;
  serverLabel: string;
  target: ProcessingFolderTarget | null;
  onChange: (target: ProcessingFolderTarget | null) => void;
  pickDirectory: () => Promise<PickedDirectory | null>;
}

/** Chooses a destination without creating or mounting anything on cancellation. */
export function ProcessingFolderPicker({
  folders,
  canPickDirectory,
  serverDisabledReason,
  serverLabel,
  target,
  onChange,
  pickDirectory,
}: ProcessingFolderPickerProps) {
  const { t } = useTranslation();
  const targetLocation =
    target?.kind === "existing" ? folderKind(target.folder) : target?.kind;
  const [location, setLocation] = useState<"server" | "local">(
    targetLocation === "local" ||
      (!target && canPickDirectory && serverDisabledReason)
      ? "local"
      : "server",
  );
  const [mode, setMode] = useState<"existing" | "new">(
    target?.kind === "server" ||
      (target?.kind === "local" && target.name !== null)
      ? "new"
      : "existing",
  );
  const [name, setName] = useState(
    target?.kind === "server" || target?.kind === "local"
      ? (target.name ?? "")
      : "",
  );
  const [parentId, setParentId] = useState(
    target?.kind === "server" ? target.parentId : null,
  );
  const [directory, setDirectory] = useState<PickedDirectory | null>(
    target?.kind === "local" ? target.directory : null,
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = folders.filter((folder) => folderKind(folder) === location);
  const blocked = location === "server" && Boolean(serverDisabledReason);

  function updateDraft(
    nextName = name,
    nextDirectory = directory,
    nextParent = parentId,
  ) {
    onChange(
      location === "server"
        ? { kind: "server", name: nextName, parentId: nextParent }
        : nextDirectory
          ? {
              kind: "local",
              directory: nextDirectory,
              name: mode === "new" ? nextName : null,
            }
          : null,
    );
  }

  async function browse() {
    setPicking(true);
    setError(null);
    try {
      const picked = await pickDirectory();
      if (picked) {
        setDirectory(picked);
        updateDraft(name, picked);
      }
    } catch (cause) {
      setError(extractErrorMessage(cause));
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="folder-setup__picker">
      <div>
        <h2 className="folder-setup__heading">
          {t("processingFolders.setup.chooseFolder")}
        </h2>
        <p className="folder-setup__lead">
          {t("processingFolders.setup.chooseFolderHint")}
        </p>
      </div>
      {canPickDirectory && (
        <SegmentedControl
          ariaLabel={t("processingFolders.setup.location")}
          fullWidth
          value={location}
          onChange={(value) => {
            setLocation(value);
            onChange(
              mode === "new" && value === "server"
                ? { kind: "server", name, parentId }
                : value === "local" && directory
                  ? {
                      kind: "local",
                      directory,
                      name: mode === "new" ? name : null,
                    }
                  : null,
            );
            setError(null);
          }}
          options={[
            {
              value: "server",
              label: (
                <span className="folder-setup__inline">
                  <Icon name="cloud" size={16} />
                  {serverLabel}
                </span>
              ),
            },
            {
              value: "local",
              label: (
                <span className="folder-setup__inline">
                  <Icon name="monitor" size={16} />
                  {t("processingFolders.setup.computer")}
                </span>
              ),
            },
          ]}
        />
      )}
      {blocked && <Banner tone="warning" description={serverDisabledReason} />}
      <SegmentedControl
        ariaLabel={t("processingFolders.setup.folderChoice")}
        value={mode}
        disabled={blocked}
        onChange={(value) => {
          setMode(value);
          onChange(
            value === "new"
              ? location === "server"
                ? { kind: "server", name, parentId }
                : directory
                  ? { kind: "local", directory, name }
                  : null
              : location === "local" && directory
                ? { kind: "local", directory, name: null }
                : null,
          );
        }}
        options={[
          {
            value: "existing",
            label: t("processingFolders.setup.useExisting"),
          },
          { value: "new", label: t("processingFolders.setup.newFolder") },
        ]}
      />
      {mode === "existing" && (
        <FormField label={t("processingFolders.setup.folder")}>
          <Select
            searchable
            disabled={blocked}
            value={target?.kind === "existing" ? target.folder.id : null}
            placeholder={t("processingFolders.setup.selectFolder")}
            nothingFoundMessage={t("processingFolders.setup.noFolders")}
            comboboxProps={{ withinPortal: false }}
            options={available.map((folder) => ({
              value: folder.id,
              label: processingFolderPath(folder, folders),
            }))}
            onChange={(id) => {
              const folder = available.find((item) => item.id === id);
              onChange(folder ? { kind: "existing", folder } : null);
            }}
          />
        </FormField>
      )}
      {mode === "new" && (
        <>
          <FormField
            label={t("processingFolders.setup.folderName")}
            required
            error={
              name && (/[\\/]/.test(name) || [".", ".."].includes(name.trim()))
                ? t("processingFolders.setup.invalidName")
                : undefined
            }
          >
            <Input
              value={name}
              disabled={blocked}
              onChange={(event) => {
                setName(event.target.value);
                updateDraft(event.target.value);
              }}
              placeholder={t("processingFolders.setup.namePlaceholder")}
            />
          </FormField>
          {location === "server" && (
            <FormField label={t("processingFolders.setup.createIn")}>
              <Select
                searchable
                disabled={blocked}
                value={parentId ?? "root"}
                comboboxProps={{ withinPortal: false }}
                options={[
                  { value: "root", label: serverLabel },
                  ...available.map((folder) => ({
                    value: folder.id,
                    label: processingFolderPath(folder, folders),
                  })),
                ]}
                onChange={(id) => {
                  const parent =
                    available.find((item) => item.id === id)?.id ?? null;
                  setParentId(parent);
                  updateDraft(name, directory, parent);
                }}
              />
            </FormField>
          )}
        </>
      )}
      {location === "local" && (
        <div className="folder-setup__disk">
          <Button
            variant="secondary"
            onClick={() => void browse()}
            loading={picking}
            leftSection={<Icon name="folder-open" size={18} />}
          >
            {t(
              mode === "new"
                ? "processingFolders.setup.chooseParent"
                : "processingFolders.setup.browseComputer",
            )}
          </Button>
          {target?.kind === "local" && (
            <p className="folder-setup__path">{target.directory.path}</p>
          )}
        </div>
      )}
      {error && <Banner tone="danger" description={error} />}
    </div>
  );
}
