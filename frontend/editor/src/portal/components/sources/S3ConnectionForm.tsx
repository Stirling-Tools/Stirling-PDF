import { useTranslation } from "react-i18next";
import { FormField, Input } from "@app/ui";

/**
 * The connection-level S3 fields (per-use settings like prefix/mode live on the
 * source or output referencing the connection). Secrets are write-only: when
 * editing, the backend returns them masked and keeps the stored value if the
 * mask is sent back unchanged.
 */
export interface S3ConnectionFormValues {
  name: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const EMPTY_S3_CONNECTION: S3ConnectionFormValues = {
  name: "",
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  accessKeyId: "",
  secretAccessKey: "",
};

export function s3ConnectionRequestConfig(
  values: S3ConnectionFormValues,
): Record<string, unknown> {
  return {
    bucket: values.bucket.trim(),
    region: values.region.trim(),
    endpoint: values.endpoint.trim(),
    accessKeyId: values.accessKeyId.trim(),
    secretAccessKey: values.secretAccessKey,
  };
}

export function s3ConnectionFormValid(values: S3ConnectionFormValues): boolean {
  return (
    values.name.trim() !== "" &&
    values.bucket.trim() !== "" &&
    values.accessKeyId.trim() !== "" &&
    values.secretAccessKey.trim() !== ""
  );
}

interface S3ConnectionFormProps {
  values: S3ConnectionFormValues;
  onChange: (values: S3ConnectionFormValues) => void;
}

export function S3ConnectionForm({ values, onChange }: S3ConnectionFormProps) {
  const { t } = useTranslation();
  const set = (key: keyof S3ConnectionFormValues, value: string) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="portal-sources__connection-form">
      <FormField label={t("portal.connections.s3.fields.name")} required>
        <Input
          value={values.name}
          placeholder={t("portal.connections.s3.fields.namePlaceholder")}
          onChange={(e) => set("name", e.target.value)}
        />
      </FormField>
      <FormField
        label={t("portal.sources.types.s3.fields.bucket.label")}
        required
      >
        <Input
          value={values.bucket}
          placeholder="my-company-inbox"
          onChange={(e) => set("bucket", e.target.value)}
        />
      </FormField>
      <FormField label={t("portal.sources.types.s3.fields.region.label")}>
        <Input
          value={values.region}
          placeholder="us-east-1"
          onChange={(e) => set("region", e.target.value)}
        />
      </FormField>
      <FormField
        label={t("portal.sources.types.s3.fields.accessKeyId.label")}
        required
      >
        <Input
          value={values.accessKeyId}
          onChange={(e) => set("accessKeyId", e.target.value)}
        />
      </FormField>
      <FormField
        label={t("portal.sources.types.s3.fields.secretAccessKey.label")}
        required
      >
        <Input
          type="password"
          value={values.secretAccessKey}
          onChange={(e) => set("secretAccessKey", e.target.value)}
        />
      </FormField>
      <FormField
        label={t("portal.sources.types.s3.fields.endpoint.label")}
        helperText={t("portal.sources.types.s3.fields.endpoint.helperText")}
      >
        <Input
          value={values.endpoint}
          placeholder="https://s3.example.com"
          onChange={(e) => set("endpoint", e.target.value)}
        />
      </FormField>
    </div>
  );
}
