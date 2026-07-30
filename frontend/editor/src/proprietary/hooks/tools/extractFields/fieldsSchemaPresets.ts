import type { FieldRow } from "@app/hooks/tools/extractFields/fieldsSchema";

/**
 * Ready-made extraction schemas for the common document types, so users start
 * from a sensible field list instead of a blank builder.
 */

export const FIELD_PRESET_IDS = [
  "invoice",
  "receipt",
  "contract",
  "purchaseOrder",
] as const;

export type FieldPresetId = (typeof FIELD_PRESET_IDS)[number];

/** The select value when the rows match no preset (hand-built schema). */
export const CUSTOM_PRESET = "custom" as const;

const PRESETS: Record<FieldPresetId, FieldRow[]> = {
  invoice: [
    {
      name: "invoice_number",
      type: "string",
      description: "The invoice identifier",
    },
    {
      name: "invoice_date",
      type: "string",
      description: "Date the invoice was issued (ISO format if possible)",
    },
    {
      name: "vendor_name",
      type: "string",
      description: "Name of the company issuing the invoice",
    },
    {
      name: "total_amount",
      type: "number",
      description: "Grand total including tax",
    },
    {
      name: "currency",
      type: "string",
      description: "Currency code or symbol",
    },
    {
      name: "due_date",
      type: "string",
      description: "Date payment is due",
    },
  ],
  receipt: [
    {
      name: "merchant_name",
      type: "string",
      description: "Store or merchant name",
    },
    {
      name: "purchase_date",
      type: "string",
      description: "Date of the purchase",
    },
    { name: "total_amount", type: "number", description: "Total paid" },
    {
      name: "tax_amount",
      type: "number",
      description: "Tax portion of the total",
    },
    {
      name: "payment_method",
      type: "string",
      description: "How it was paid, e.g. card or cash",
    },
  ],
  contract: [
    {
      name: "party_a",
      type: "string",
      description: "First contracting party's legal name",
    },
    {
      name: "party_b",
      type: "string",
      description: "Second contracting party's legal name",
    },
    {
      name: "effective_date",
      type: "string",
      description: "Date the agreement takes effect",
    },
    {
      name: "termination_date",
      type: "string",
      description: "Date the agreement ends or renews",
    },
    {
      name: "governing_law",
      type: "string",
      description: "Jurisdiction governing the agreement",
    },
    {
      name: "auto_renews",
      type: "boolean",
      description: "Whether the contract renews automatically",
    },
  ],
  purchaseOrder: [
    {
      name: "po_number",
      type: "string",
      description: "Purchase order identifier",
    },
    { name: "order_date", type: "string", description: "Date of the order" },
    {
      name: "supplier_name",
      type: "string",
      description: "Supplier the order is placed with",
    },
    {
      name: "delivery_date",
      type: "string",
      description: "Requested or promised delivery date",
    },
    { name: "total_amount", type: "number", description: "Order total" },
  ],
};

/** A fresh copy of the preset's rows, safe to mutate in the builder. */
export function presetRows(preset: FieldPresetId): FieldRow[] {
  return PRESETS[preset].map((row) => ({ ...row }));
}

/** The preset the rows exactly match, or "custom" for anything hand-edited. */
export function matchPreset(rows: FieldRow[]): FieldPresetId | "custom" {
  for (const preset of FIELD_PRESET_IDS) {
    const candidate = PRESETS[preset];
    if (
      rows.length === candidate.length &&
      rows.every(
        (row, i) =>
          row.name === candidate[i].name &&
          row.type === candidate[i].type &&
          row.description === candidate[i].description,
      )
    ) {
      return preset;
    }
  }
  return CUSTOM_PRESET;
}
