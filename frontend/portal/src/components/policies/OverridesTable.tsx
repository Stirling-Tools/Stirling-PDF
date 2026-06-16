import { useState } from "react";
import { Button, Input } from "@shared/components";
import type { PolicyOverride } from "@portal/api/policies";
import "@portal/views/Policies.css";

interface OverridesTableProps {
  overrides: PolicyOverride[];
  onChange: (overrides: PolicyOverride[]) => void;
}

/**
 * Editable per-document-type override rows for one category. Kept as a small
 * hand-rolled table (rather than the static SUI Table) because rows are
 * add/remove and each cell is an input — interactivity the presentational
 * Table primitive doesn't carry.
 */
export function OverridesTable({ overrides, onChange }: OverridesTableProps) {
  const [draftType, setDraftType] = useState("");
  const [draftRule, setDraftRule] = useState("");

  function addRow() {
    const docType = draftType.trim();
    const rule = draftRule.trim();
    if (!docType || !rule) return;
    onChange([...overrides, { docType, rule }]);
    setDraftType("");
    setDraftRule("");
  }

  function removeRow(index: number) {
    onChange(overrides.filter((_, i) => i !== index));
  }

  return (
    <div className="portal-policies__overrides">
      {overrides.length === 0 && (
        <p className="portal-policies__overrides-empty">
          No per-document-type overrides — the global default applies to
          everything.
        </p>
      )}

      {overrides.map((o, i) => (
        <div
          key={`${o.docType}-${i}`}
          className="portal-policies__override-row"
        >
          <span className="portal-policies__override-type">{o.docType}</span>
          <span className="portal-policies__override-rule">{o.rule}</span>
          <button
            type="button"
            className="portal-policies__override-remove"
            onClick={() => removeRow(i)}
            aria-label={`Remove ${o.docType} override`}
          >
            ×
          </button>
        </div>
      ))}

      <div className="portal-policies__override-add">
        <Input
          inputSize="sm"
          placeholder="Document type"
          value={draftType}
          onChange={(e) => setDraftType(e.target.value)}
        />
        <Input
          inputSize="sm"
          placeholder="Rule for this type"
          value={draftRule}
          onChange={(e) => setDraftRule(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={!draftType.trim() || !draftRule.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
