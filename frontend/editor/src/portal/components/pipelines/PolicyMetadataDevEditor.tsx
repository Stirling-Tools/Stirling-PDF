import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, FormField } from "@app/ui";
import "@portal/components/pipelines/PolicyMetadataDevEditor.css";

interface PolicyMetadataDevEditorProps {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * Temporary home for a policy's metadata bag (`output.options`: runOn, sources, output naming,
 * scope, reviewer, fieldValues...). These settings were designed for the simple policy wizard, not
 * the pipeline model, so until they get first-class builder UI they live here as raw, editable JSON
 * - enough that a customised policy never silently loses them. Deliberately unpolished.
 */
export function PolicyMetadataDevEditor({
  value,
  onChange,
}: PolicyMetadataDevEditorProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);

  // Re-sync from the outside only when the value changes shape while the text is valid, so an edit
  // elsewhere (e.g. seeding) is reflected without clobbering the operator mid-keystroke.
  useEffect(() => {
    if (!invalid) setText(JSON.stringify(value, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function edit(next: string) {
    setText(next);
    try {
      const parsed = JSON.parse(next) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setInvalid(false);
        onChange(parsed as Record<string, unknown>);
        return;
      }
      setInvalid(true);
    } catch {
      setInvalid(true);
    }
  }

  return (
    <>
      <FormField
        label={t("portal.pipelines.builder.metadata.label")}
        helperText={t("portal.pipelines.builder.metadata.helper")}
      >
        <textarea
          className="portal-builder__dev-json"
          spellCheck={false}
          value={text}
          onChange={(e) => edit(e.target.value)}
          aria-invalid={invalid}
          rows={10}
        />
      </FormField>
      {invalid && (
        <Banner
          tone="warning"
          description={t("portal.pipelines.builder.metadata.invalid")}
        />
      )}
    </>
  );
}
