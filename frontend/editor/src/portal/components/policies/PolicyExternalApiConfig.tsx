import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Banner, Button, FormField, Input, Select } from "@app/ui";
import { fetchIntegrationCapabilities } from "@portal/api/integrations";
import { ConnectionPicker } from "@portal/components/sources/ConnectionPicker";
import {
  CONNECTION_CATEGORIES,
  type ConnectionCategory,
} from "@portal/components/sources/connectionTypes";
import { BrandMark } from "@portal/components/BrandMarks";
import {
  STEP_OPERATIONS,
  buildStepParameters,
  emptyOperationValues,
  operationById,
  operationsByCategory,
  searchOperations,
  type ExternalApiStepParams,
  type StepOperation,
} from "@portal/components/policies/stepOperations";

/**
 * Configures a "send the document to another system" step.
 *
 * The step's own API takes seventeen parameters — path, body mode, file field name, response mode
 * and so on. Asking an operator for those is asking them to have read the vendor's API docs, which
 * is the difference between supporting a vendor and merely being able to reach it. So this screen
 * asks two questions instead: *what do you want to do*, and *with which account*. The catalogue
 * fills in the rest.
 *
 * The escape hatch stays: choosing Custom API reveals the raw call, because an operator connecting
 * something we do not ship a template for still needs a way through.
 */
/**
 * Every step parameter is a flat string (the pipeline serialises them as form fields), so the
 * operator's answers travel JSON-encoded in `operationValues` and are decoded here.
 */
export type ExternalApiParams = ExternalApiStepParams;

function decodeValues(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    // A hand-edited or truncated value should not break the form.
    return {};
  }
}

interface PolicyExternalApiConfigProps {
  parameters: ExternalApiParams;
  onChange: (parameters: ExternalApiParams) => void;
}

export function PolicyExternalApiConfig({
  parameters,
  onChange,
}: PolicyExternalApiConfigProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  // Whether to OFFER the escape hatch. The server refuses it regardless of what the client
  // believes, so this is presentation only - the same contract the connections tab uses.
  const [allowCustom, setAllowCustom] = useState(true);

  useEffect(() => {
    fetchIntegrationCapabilities().then(
      (c) => setAllowCustom(c.customApi !== false),
      () => undefined,
    );
  }, []);

  const selected = parameters.operationId
    ? operationById(parameters.operationId)
    : undefined;
  const values = decodeValues(parameters.operationValues);

  const available = useMemo(
    () => STEP_OPERATIONS.filter((op) => allowCustom || !op.custom),
    [allowCustom],
  );
  const matches = useMemo(
    () => searchOperations(available, query, (key) => t(key)),
    [available, query, t],
  );
  const grouped = useMemo(() => operationsByCategory(matches), [matches]);
  const searching = query.trim() !== "";

  function choose(op: StepOperation) {
    // Picking from the grid always starts the operation fresh with no account: a Slack webhook is
    // not a valid Jira account, and reaching the grid means the operator is choosing anew. The
    // account chosen for a previous operation would otherwise ride along, unlisted by the vendor
    // filter yet still saved.
    onChange(buildStepParameters(op, "", emptyOperationValues(op)));
  }

  function setValue(key: string, value: string) {
    if (!selected) return;
    const next = { ...values, [key]: value };
    onChange(
      buildStepParameters(selected, parameters.connectionId ?? "", next),
    );
  }

  function setConnection(id: string) {
    if (!selected) {
      onChange({ ...parameters, connectionId: id });
      return;
    }
    onChange(buildStepParameters(selected, id, values));
  }

  // ---- step 1: pick what the step should do ---------------------------------------------------
  if (!selected) {
    const sections: ConnectionCategory[] = searching
      ? []
      : CONNECTION_CATEGORIES.filter((c) => (grouped.get(c)?.length ?? 0) > 0);

    return (
      <div className="portal-policies__capability-config">
        <div className="portal-conn-picker__search">
          <SearchRoundedIcon className="portal-conn-picker__search-icon" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("portal.policies.operations.searchPlaceholder")}
            aria-label={t("portal.policies.operations.searchPlaceholder")}
          />
        </div>

        {matches.length === 0 ? (
          <p className="portal-conn-picker__empty-body">
            {t("portal.policies.operations.noResults")}
          </p>
        ) : searching ? (
          <OperationGrid operations={matches} onPick={choose} />
        ) : (
          sections.map((category) => (
            <section key={category} className="portal-conn-picker__section">
              <h4 className="portal-conn-picker__section-title">
                {t(`portal.connections.categories.${category}.label`)}
              </h4>
              <OperationGrid
                operations={grouped.get(category) ?? []}
                onPick={choose}
              />
            </section>
          ))
        )}
      </div>
    );
  }

  // ---- step 2: the two questions that remain --------------------------------------------------
  return (
    <div className="portal-policies__capability-config">
      <Button
        variant="quiet"
        size="sm"
        className="portal-sources__connection-back"
        leftSection={<ArrowBackRoundedIcon fontSize="inherit" />}
        onClick={() =>
          onChange({
            ...parameters,
            operationId: "",
            operationValues: "",
            // Forget the account too: it belonged to this operation's vendor, and the next pick
            // starts clean rather than carrying it to a mismatched one.
            connectionId: "",
          })
        }
      >
        {t("portal.policies.operations.change")}
      </Button>

      <p className="portal-policies__capability-summary">
        {t(selected.descriptionKey)}
      </p>

      {selected.noteKey && (
        <Banner tone="warning" description={t(selected.noteKey)} />
      )}

      <FormField
        label={t("portal.policies.operations.fields.connection.label")}
        required
      >
        <ConnectionPicker
          value={parameters.connectionId ?? ""}
          onChange={setConnection}
          integrationType={selected.integrationType}
          createTypeId={selected.connectionTypeId}
          presetId={selected.connectionTypeId}
        />
      </FormField>

      {(selected.fields ?? []).map((field) => (
        <FormField
          key={field.key}
          label={t(field.labelKey)}
          required={field.required}
          helperText={field.helperTextKey ? t(field.helperTextKey) : undefined}
        >
          {field.control === "textarea" ? (
            <textarea
              className="portal-sources__connection-textarea"
              rows={3}
              value={values[field.key] ?? ""}
              onChange={(e) => setValue(field.key, e.target.value)}
            />
          ) : field.control === "select" ? (
            <Select
              value={values[field.key] ?? ""}
              options={(field.options ?? []).map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
              onChange={(v) => v && setValue(field.key, v)}
            />
          ) : (
            <Input
              value={values[field.key] ?? ""}
              placeholder={
                field.placeholderKey ? t(field.placeholderKey) : undefined
              }
              onChange={(e) => setValue(field.key, e.target.value)}
            />
          )}
        </FormField>
      ))}

      {selected.custom && (
        <CustomCallFields parameters={parameters} onChange={onChange} />
      )}
    </div>
  );
}

function OperationGrid({
  operations,
  onPick,
}: {
  operations: StepOperation[];
  onPick: (op: StepOperation) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-conn-picker__grid">
      {operations.map((op) => {
        const label = t(op.labelKey);
        return (
          <button
            key={op.id}
            type="button"
            className={
              "portal-conn-picker__card" +
              (op.custom ? " portal-conn-picker__card--advanced" : "")
            }
            onClick={() => onPick(op)}
          >
            <span className="portal-conn-picker__mark" aria-hidden>
              <BrandMark
                id={op.custom ? "api" : op.connectionTypeId}
                size={20}
              />
            </span>
            <span className="portal-conn-picker__card-text">
              <span className="portal-conn-picker__card-name">{label}</span>
              <span className="portal-conn-picker__card-desc">
                {t(op.descriptionKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The raw call, shown only for Custom API. These are the same parameters a preset fills in
 * silently — exposed here because there is no template to fill them.
 */
function CustomCallFields({
  parameters,
  onChange,
}: {
  parameters: ExternalApiParams;
  onChange: (p: ExternalApiParams) => void;
}) {
  const { t } = useTranslation();
  const set = (key: keyof ExternalApiParams, value: string) =>
    onChange({ ...parameters, [key]: value });
  const str = (key: keyof ExternalApiParams) => parameters[key] ?? "";

  return (
    <>
      <FormField
        label={t("portal.policies.operations.fields.path.label")}
        helperText={t("portal.policies.operations.fields.path.helperText")}
        required
      >
        <Input
          value={str("path")}
          placeholder="/v1/scan"
          onChange={(e) => set("path", e.target.value)}
        />
      </FormField>

      <FormField label={t("portal.policies.operations.fields.method.label")}>
        <Select
          value={str("method") || "POST"}
          options={["POST", "PUT", "PATCH", "GET"].map((m) => ({
            value: m,
            label: m,
          }))}
          onChange={(v) => v && set("method", v)}
        />
      </FormField>

      <FormField
        label={t("portal.policies.operations.fields.bodyMode.label")}
        helperText={t("portal.policies.operations.fields.bodyMode.helperText")}
      >
        <Select
          value={str("bodyMode") || "multipart"}
          options={[
            {
              value: "multipart",
              label: t("portal.policies.operations.bodyMode.multipart"),
            },
            {
              value: "json",
              label: t("portal.policies.operations.bodyMode.json"),
            },
            {
              value: "binary",
              label: t("portal.policies.operations.bodyMode.binary"),
            },
          ]}
          onChange={(v) => v && set("bodyMode", v)}
        />
      </FormField>

      {(str("bodyMode") || "multipart") === "multipart" && (
        <FormField
          label={t("portal.policies.operations.fields.fileFieldName.label")}
          helperText={t(
            "portal.policies.operations.fields.fileFieldName.helperText",
          )}
        >
          <Input
            value={str("fileFieldName") || "file"}
            onChange={(e) => set("fileFieldName", e.target.value)}
          />
        </FormField>
      )}

      <FormField
        label={t("portal.policies.operations.fields.responseMode.label")}
        helperText={t(
          "portal.policies.operations.fields.responseMode.helperText",
        )}
      >
        <Select
          value={str("responseMode") || "report"}
          options={[
            {
              value: "report",
              label: t("portal.policies.operations.responseMode.report"),
            },
            {
              value: "replace",
              label: t("portal.policies.operations.responseMode.replace"),
            },
          ]}
          onChange={(v) => v && set("responseMode", v)}
        />
      </FormField>

      <FormField
        label={t("portal.policies.operations.fields.headers.label")}
        helperText={t("portal.policies.operations.fields.headers.helperText")}
      >
        <textarea
          className="portal-sources__connection-textarea"
          rows={2}
          value={str("headers")}
          placeholder='{"X-Api-Version": "2"}'
          onChange={(e) => set("headers", e.target.value)}
        />
      </FormField>

      {(str("bodyMode") || "multipart") === "json" && (
        <FormField
          label={t("portal.policies.operations.fields.bodyTemplate.label")}
          helperText={t(
            "portal.policies.operations.fields.bodyTemplate.helperText",
          )}
        >
          <textarea
            className="portal-sources__connection-textarea"
            rows={4}
            value={str("bodyTemplate")}
            placeholder='{"file": "{{document.base64}}"}'
            onChange={(e) => set("bodyTemplate", e.target.value)}
          />
        </FormField>
      )}
    </>
  );
}
