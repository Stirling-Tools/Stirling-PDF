/**
 * Static preset definitions for Policies - the catalogue categories and the PII
 * presets a Security policy's redact step seeds from. Runtime activity + stats
 * are derived live from the user's real files, not defined here.
 */

import { policyCategoryIcon } from "@editor/components/policies/policyCategoryIcon";
import type { PolicyCategory } from "@editor/types/policies";

const ICON_SIZE = "1rem";

/** The 5 policy categories, in display order. */
export const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    icon: policyCategoryIcon("ingestion", ICON_SIZE),
    desc: "Classify documents, extract structured data, enforce naming conventions, and normalize pages.",
    // The classifier the wizard's "Set up Classification" action routes to.
    providesClassification: true,
    // Needs the classify agent + RAG, which aren't built yet.
    comingSoon: true,
  },
  {
    id: "security",
    label: "Security",
    icon: policyCategoryIcon("security", ICON_SIZE),
    desc: "Detect PII, encrypt, verify authenticity, control access, and certify documents.",
  },
  {
    id: "classification",
    label: "Classification",
    icon: policyCategoryIcon("classification", ICON_SIZE),
    desc: "Identify each document's type on upload and tag its metadata for filing and search.",
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: policyCategoryIcon("compliance", ICON_SIZE),
    desc: "Enforce HIPAA, GDPR, SOC 2, or FedRAMP requirements on every document.",
    comingSoon: true,
  },
  {
    id: "routing",
    label: "Routing",
    icon: policyCategoryIcon("routing", ICON_SIZE),
    desc: "Auto-route documents to the right team, folder, or system.",
    comingSoon: true,
  },
  {
    id: "retention",
    label: "Retention",
    icon: policyCategoryIcon("retention", ICON_SIZE),
    desc: "Set how long documents are kept, when to archive, and when to delete.",
    comingSoon: true,
  },
];
