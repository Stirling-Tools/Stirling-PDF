import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import {
  createIntegration,
  updateIntegration,
  type IntegrationCapabilities,
  type IntegrationConfig,
} from "@portal/api/integrations";
import { ConnectionTypePicker } from "@portal/components/sources/ConnectionTypePicker";
import { ConnectionForm } from "@portal/components/sources/ConnectionForm";
import {
  CREATABLE_CONNECTION_TYPES,
  buildConnectionConfig,
  connectionFormValid,
  connectionFormValues,
  connectionTypeOf,
  creatableConnectionTypes,
  emptyConnectionValues,
  type CreatableConnectionType,
} from "@portal/components/sources/connectionTypes";

/**
 * The one place connections are created and edited, for every type.
 *
 * Launched from the Connections tab, the source builder's picker, and the pipeline builder output,
 * so setup is always a modal rather than inline splat. What can be created comes from the server's
 * capabilities (`customApi`), not from anything decided here — hiding the option is presentation;
 * the backend refuses the call regardless.
 *
 * Saving validates backend-side (schema, host, credentials). On edit the type is fixed: an
 * integration's type is what its stored config means, so changing it would reinterpret the config
 * rather than convert it.
 */
interface ConnectionModalProps {
  open: boolean;
  /** When set, edit this connection; otherwise create a new one. */
  connection?: IntegrationConfig | null;
  /** Pin the type (e.g. an S3 picker creating inline) instead of offering a choice. */
  fixedTypeId?: string;
  capabilities?: IntegrationCapabilities;
  onClose: () => void;
  /** The saved connection, so callers can select or refresh it. */
  onSaved: (connection: IntegrationConfig) => void;
}

export function ConnectionModal({
  open,
  connection,
  fixedTypeId,
  capabilities,
  onClose,
  onSaved,
}: ConnectionModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<CreatableConnectionType | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ name: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "pick" chooses what to connect to; "form" fills it in.
  const [mode, setMode] = useState<"pick" | "form">("pick");
  const isEdit = Boolean(connection);

  // A pinned slot is an explicit choice, already vetted where it was offered (the S3 field, or the
  // custom-API operation, which is itself capability-gated). Resolve it from the full catalogue so
  // the modal always has its form - the open picker still respects capabilities. Filtering the pin
  // through capabilities is what blanked the modal: the custom-API type is gated, so it dropped out
  // and left the picker with nothing to show.
  const available = fixedTypeId
    ? CREATABLE_CONNECTION_TYPES.filter((entry) => entry.id === fixedTypeId)
    : creatableConnectionTypes(capabilities);
  // The picker is only worth showing when there is actually a choice - not for a pinned slot
  // (an S3 field on a source) or an edit, where the type is already decided.
  const canPick = !isEdit && !fixedTypeId;

  // Seed each time the modal opens (or its target changes).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (connection) {
      setMode("form");
      const existing = connectionTypeOf(
        connection.integrationType,
        connection.config,
      );
      setType(existing ?? null);
      setValues(
        existing
          ? connectionFormValues(existing, {
              name: connection.name,
              config: connection.config ?? {},
            })
          : { name: connection.name },
      );
      return;
    }
    // A pinned slot (an S3 field on a source) has nothing to choose, so skip straight to the form.
    // Stay on the form even if the pin resolves to nothing: the form branch shows a clear
    // "unsupported type" banner, whereas the picker would render an empty grid - a blank screen.
    const pinned = fixedTypeId ? (available[0] ?? null) : null;
    setMode(fixedTypeId ? "form" : "pick");
    setType(pinned);
    setValues(pinned ? emptyConnectionValues(pinned) : { name: "" });
    // `available` is derived from props each render; depending on it would reseed on every
    // keystroke and wipe the form.
  }, [open, connection, fixedTypeId, capabilities]);

  function pickType(next: CreatableConnectionType) {
    setType(next);
    setValues((current) => ({
      ...emptyConnectionValues(next),
      name: current.name ?? "",
    }));
    setMode("form");
  }

  async function save() {
    if (saving || !type || !connectionFormValid(type, values)) return;
    setSaving(true);
    setError(null);
    try {
      const config = buildConnectionConfig(type, values);
      const saved = connection
        ? await updateIntegration(connection.id, {
            name: values.name.trim(),
            config,
          })
        : // TEAM scope suits the team-based portal (the backend defaults the team to the
          // caller's own). A teamless single-operator self-hosted deployment would need a
          // USER/SERVER scope choice here - follow-up if the portal ships there.
          await createIntegration({
            integrationType: type.integrationType,
            name: values.name.trim(),
            scope: "TEAM",
            config,
          });
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      // The grid wants room to breathe; a form is easier to read narrow.
      width={mode === "pick" ? "lg" : "md"}
      title={
        isEdit
          ? t("portal.connections.editTitle")
          : mode === "pick"
            ? t("portal.connections.picker2.heading")
            : // Once something is chosen the title says what, so the form is self-describing.
              t("portal.connections.createTitleFor", {
                name: type ? t(type.labelKey) : "",
              })
      }
      footer={
        // The picker commits on click, so the modal's footer belongs to the form step alone.
        mode === "form" ? (
          <div className="portal-sources__connection-create-actions">
            <Button
              variant="tertiary"
              size="sm"
              disabled={saving}
              onClick={onClose}
            >
              {t("portal.connections.picker.cancel")}
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={!type || !connectionFormValid(type, values)}
              onClick={() => void save()}
            >
              {t("portal.connections.picker.save")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {mode === "pick" ? (
        <ConnectionTypePicker types={available} onPick={pickType} />
      ) : (
        <>
          {canPick && (
            // The choice is made in the picker now; this just gets them back to it, so the
            // selection stays visible without a dropdown that duplicates the grid.
            <Button
              variant="quiet"
              size="sm"
              className="portal-sources__connection-back"
              leftSection={<ArrowBackRoundedIcon fontSize="inherit" />}
              onClick={() => setMode("pick")}
            >
              {t("portal.connections.picker2.back")}
            </Button>
          )}

          {type ? (
            <ConnectionForm type={type} values={values} onChange={setValues} />
          ) : (
            // An unknown stored type (e.g. MCP, which has no form) must not render a blank editor
            // that would save an empty config over whatever is there.
            <Banner
              tone="warning"
              description={t("portal.connections.unsupportedType")}
            />
          )}
          {error && <Banner tone="danger" description={error} />}
        </>
      )}
    </Modal>
  );
}
