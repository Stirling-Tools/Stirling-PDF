/**
 * Static preset definitions for Policies - the catalogue categories and the PII
 * presets a Security policy's redact step seeds from. Runtime activity + stats
 * are derived live from the user's real files, not defined here.
 */

import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import type { PolicyCategory } from "@app/types/policies";

const ICON_SX = { fontSize: "1rem" } as const;

/** The 5 policy categories, in display order. */
export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: policyCategoryIcon("ingestion", ICON_SX),
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
    // The classifier the wizard's "Set up Classification" action routes to.
    providesClassification: true,
    // Needs the classify agent + RAG, which aren't built yet.
    comingSoon: true,
  },
  {
    id: "security",
    label: "Security",
    icon: policyCategoryIcon("security", ICON_SX),
    desc: "Detect PII, encrypt, verify authenticity, control access, and certify documents.",
  },
  {
    id: "classification",
    label: "Classification",
    icon: policyCategoryIcon("classification", ICON_SX),
    desc: "Identify each document's type on upload and tag its metadata for filing and search.",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: policyCategoryIcon("compliance", ICON_SX),
    desc: "Enforce HIPAA, GDPR, SOC 2, or FedRAMP requirements on every document.",
    comingSoon: true,
  },
  {
    id: "routing",
    label: "Routing",
    icon: policyCategoryIcon("routing", ICON_SX),
    desc: "Auto-route documents to the right team, folder, or system.",
    comingSoon: true,
  },
  {
    id: "retention",
    label: "Retention",
    icon: policyCategoryIcon("retention", ICON_SX),
    desc: "Set how long documents are kept, when to archive, and when to delete.",
    comingSoon: true,
  },
];

/**
 * PII presets for the redact step: a label + the regex the /auto-redact endpoint
 * matches (via `wordsToRedact` + `useRegex`). Patterns are precise — validated
 * (SSN areas, card IINs, ABA prefixes), context- or separator-anchored — to keep
 * false positives down and avoid catastrophic backtracking.
 */
export const PII_PRESETS: { value: string; label: string; pattern: string }[] =
  [
    {
      value: "ssn",
      label: "Social Security numbers",
      // 123-45-6789 or 123 45 6789; rejects invalid areas (000/666/9xx),
      // group 00, serial 0000, and mixed separators (backreference).
      pattern:
        "\\b(?!000|666|9\\d{2})\\d{3}([- ])(?!00)\\d{2}\\1(?!0000)\\d{4}\\b",
    },
    {
      value: "card",
      label: "Credit / debit cards",
      // Solid runs anchored to real IINs (Visa 13/16, MC 51–55 + 2221–2720,
      // Amex 34/37, Discover 6011/65xx) + grouped 4-4-4-4 and Amex 4-6-5
      // with a consistent separator enforced by backreference.
      pattern:
        "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|(?:222[1-9]|22[3-9]\\d|2[3-6]\\d{2}|27[01]\\d|2720)\\d{12}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12}|[2-6]\\d{3}([ -])\\d{4}\\1\\d{4}\\1\\d{4}|3[47]\\d{2}([ -])\\d{6}\\2\\d{5})\\b",
    },
    {
      value: "iban",
      label: "IBANs",
      // Solid (GB29NWBK…) or space-grouped (GB29 NWBK 6016 …) form.
      pattern:
        "\\b[A-Z]{2}\\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,4})?)\\b",
    },
    {
      value: "routing",
      label: "US routing numbers (ABA)",
      // 9 digits constrained to valid Federal Reserve prefix ranges.
      pattern: "\\b(?:0[1-9]|1[0-2]|2[1-9]|3[0-2]|6[1-9]|7[0-2]|80)\\d{7}\\b",
    },
    {
      value: "account",
      label: "Account numbers (labelled)",
      // Context-anchored: only digits preceded by Account / Acct / A/C.
      pattern:
        "\\b(?:[Aa]cc(?:oun)?t|[Aa]/[Cc])(?:\\s+(?:[Nn]o\\.?|[Nn]umber|#))?\\s*[:#]?\\s*\\d{6,17}\\b",
    },
    {
      value: "email",
      label: "Email addresses",
      // Requires a real TLD (≥2 letters); won't swallow a sentence-ending period.
      pattern:
        "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}\\b",
    },
    {
      value: "phone",
      label: "Phone numbers",
      // (555) 123-4567 · 555-123-4567 (consistent separator) · +E.164 solid or
      // grouped · UK 0-prefixed grouped formats. Bare 10-digit runs excluded.
      pattern:
        "\\(\\d{3}\\)[ .-]?\\d{3}[ .-]?\\d{4}\\b|\\b\\d{3}([ .-])\\d{3}\\1\\d{4}\\b|\\+\\d{1,3}[ .-]?\\d{6,12}\\b|\\+\\d{1,3}(?:[ .-]\\d{2,4}){2,5}\\b|\\b0\\d{2,4}[ -]\\d{3,4}[ -]?\\d{3,4}\\b",
    },
  ];

/**
 * Defaults seeded into a fresh Security policy's redact step — only the two
 * strictest, precise patterns (SSN + cards). Users add the rest (IBAN, routing,
 * account, email, phone) from the PII dropdown.
 */
export const DEFAULT_PII_PATTERNS: string[] = [
  PII_PRESETS[0].pattern, // SSN
  PII_PRESETS[1].pattern, // cards
];
