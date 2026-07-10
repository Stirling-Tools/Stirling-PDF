/**
 * Maps a policy catalogue option's English label to a stable, descriptive i18n
 * key id. Policy doc-types and field options are looked up dynamically as
 * `t(`policies.docType.${policyOptionKey(value)}`, value)` — keying by this id
 * rather than the raw label keeps the translation keys short identifiers
 * (`financialReports`, `oneYear`, `p60`) instead of the display strings
 * themselves (`"Financial reports"`, `"1 year"`, `"60%"`), while the label stays
 * the stored value + the en-US fallback. Unmapped values fall back to the raw
 * value, so a new catalogue entry degrades to its label until a key is added.
 */
const OPTION_KEY_BY_LABEL: Record<string, string> = {
  // Document types (policies.docType)
  Contracts: "contracts",
  "Financial reports": "financialReports",
  "HR records": "hrRecords",
  Insurance: "insurance",
  Invoices: "invoices",
  "Legal filings": "legalFilings",
  "Medical / PHI": "medicalPhi",
  "Tax documents": "taxDocuments",
  // Retention periods (archiveAfter / keepFor)
  "1 year": "oneYear",
  "3 years": "threeYears",
  "7 years": "sevenYears",
  "30 days": "thirtyDays",
  "90 days": "ninetyDays",
  Never: "never",
  Indefinite: "indefinite",
  // Actions (belowThreshold / onViolation)
  "Flag for review": "flagForReview",
  Hold: "hold",
  "Route to bucket": "routeToBucket",
  "Auto-redact PHI": "autoRedactPhi",
  "Block export": "blockExport",
  "Quarantine document": "quarantineDocument",
  // Destinations
  Documents: "documents",
  "S3 bucket": "s3Bucket",
  SharePoint: "sharePoint",
  Webhook: "webhook",
  // Compliance frameworks
  FedRAMP: "fedramp",
  GDPR: "gdpr",
  HIPAA: "hipaa",
  "ISO 27001": "iso27001",
  "PCI DSS": "pciDss",
  "SOC 2": "soc2",
  // Confidence thresholds
  "60%": "p60",
  "70%": "p70",
  "80%": "p80",
  "90%": "p90",
  "95%": "p95",
};

/** The i18n key id for a policy option label (its label if unmapped). */
export function policyOptionKey(label: string): string {
  return OPTION_KEY_BY_LABEL[label] ?? label;
}
