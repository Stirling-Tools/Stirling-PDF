// Default classification labels — the type-safe source of truth. Edit THIS file, never the generated engine JSON (kept in sync by `task frontend:classifier-labels`, drift-guarded by `:check`). Each label has a stable `id` (slug, the identity used on the wire, in storage and for sidebar prefs) and a human `name` (display, translatable via `classification.labels.<id>`). Labels are flat document-type descriptors (multi-label; no deep-content/PII types since the classifier only reads the first/last two pages) declared in FAMILIES — presentational sidebar roll-ups the classifier never sees. Seeded per team (admin-editable). `icon` is presentational only; the engine never sees it.

export interface ClassificationLabel {
  /** Stable identity (slug) — the value on the wire, stored on the doc, and
   *  keyed on. Independent of the (translatable) display name. */
  id: string;
  /** Human display name; the en-US default for `classification.labels.<id>`. */
  name: string;
  /** Material Symbols icon key (see `labelIcons.ts`). */
  icon?: string;
}

/** A built-in label as authored below — the `id` is derived from the name. */
interface RawLabel {
  name: string;
  icon?: string;
}
interface RawFamily {
  id: string;
  name: string;
  icon: string;
  labels: RawLabel[];
}

/**
 * Stable slug id from a label's canonical (English) name. The id — not the
 * name — is the identity everywhere (classifier, storage, sidebar prefs), so
 * treat the built-in names as stable: renaming one changes its id.
 */
export function labelId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface LabelFamily {
  /** Stable identity for sidebar prefs — never rename once shipped. */
  id: string;
  /** Group header text shown in the sidebar and the group picker. */
  name: string;
  /** Material Symbols icon key (see `labelIcons.ts`). */
  icon: string;
  /** The built-in labels this family rolls up in the sidebar. */
  labels: ClassificationLabel[];
}

const RAW_LABEL_FAMILIES: RawFamily[] = [
  {
    id: "finance",
    name: "Financial",
    icon: "payments",
    labels: [
      { name: "Invoice", icon: "receipt-long" },
      { name: "Receipt", icon: "receipt" },
      { name: "Credit note", icon: "currency-exchange" },
      { name: "Debit note", icon: "attach-money" },
      { name: "Purchase order", icon: "shopping-cart" },
      { name: "Order confirmation", icon: "shopping-cart" },
      { name: "Quote", icon: "request-quote" },
      { name: "Estimate", icon: "price-check" },
      { name: "Proforma invoice", icon: "paid" },
      { name: "Bank statement", icon: "account-balance" },
      { name: "Financial statement", icon: "account-balance-wallet" },
      { name: "Balance sheet", icon: "table-chart" },
      { name: "Income statement", icon: "functions" },
      { name: "Cash flow statement", icon: "query-stats" },
      { name: "Expense report", icon: "credit-card" },
      { name: "Budget", icon: "savings" },
      { name: "Financial forecast", icon: "insights" },
      { name: "Payslip", icon: "payments" },
      { name: "Payroll document", icon: "wallet" },
      { name: "Tax form", icon: "calculate" },
      { name: "Tax return", icon: "percent" },
      { name: "Tax statement", icon: "calculate" },
      { name: "Remittance advice", icon: "send" },
      { name: "Payment reminder", icon: "schedule" },
      { name: "Statement of account", icon: "inbox" },
      { name: "Dunning letter", icon: "mail" },
      { name: "Audit report", icon: "fact-check" },
      { name: "Annual report", icon: "leaderboard" },
      { name: "Quarterly report", icon: "bar-chart" },
      { name: "Pricing sheet", icon: "sell" },
      { name: "Price list", icon: "format-list-bulleted" },
      { name: "Loan document", icon: "assured-workload" },
      { name: "Mortgage document", icon: "home" },
      { name: "Investment summary", icon: "trending-up" },
      { name: "Donation receipt", icon: "volunteer-activism" },
    ],
  },
  {
    id: "legal",
    name: "Legal",
    icon: "gavel",
    labels: [
      { name: "Contract", icon: "handshake" },
      { name: "NDA", icon: "lock" },
      { name: "Service agreement", icon: "handshake" },
      { name: "Employment contract", icon: "work" },
      { name: "Lease agreement", icon: "home-work" },
      { name: "Rental agreement", icon: "home-work" },
      { name: "License agreement", icon: "verified" },
      { name: "Purchase agreement", icon: "shopping-cart" },
      { name: "Partnership agreement", icon: "diversity-3" },
      { name: "Loan agreement", icon: "account-balance" },
      { name: "Settlement agreement", icon: "balance" },
      { name: "Vendor agreement", icon: "storefront" },
      { name: "Franchise agreement", icon: "business-center" },
      { name: "Non-compete agreement", icon: "gavel" },
      { name: "Amendment", icon: "edit-document" },
      { name: "Addendum", icon: "edit-document" },
      { name: "Terms and conditions", icon: "gavel" },
      { name: "Terms of service", icon: "gavel" },
      { name: "Privacy policy", icon: "privacy-tip" },
      { name: "Power of attorney", icon: "gavel" },
      { name: "Affidavit", icon: "gavel" },
      { name: "Will", icon: "history-edu" },
      { name: "Trust document", icon: "shield" },
      { name: "Deed", icon: "home-work" },
      { name: "Court filing", icon: "balance" },
      { name: "Legal brief", icon: "balance" },
      { name: "Legal opinion", icon: "balance" },
      { name: "Legal notice", icon: "gavel" },
      { name: "Subpoena", icon: "gavel" },
      { name: "Cease and desist", icon: "gavel" },
      { name: "Compliance document", icon: "rule" },
      { name: "Regulatory filing", icon: "rule" },
      { name: "Consent form", icon: "fact-check" },
      { name: "Waiver", icon: "fact-check" },
      { name: "Memorandum of understanding", icon: "handshake" },
      { name: "Letter of intent", icon: "draft" },
      { name: "Articles of incorporation", icon: "business-center" },
      { name: "Bylaws", icon: "rule" },
      { name: "Shareholder agreement", icon: "handshake" },
      { name: "Board resolution", icon: "groups" },
    ],
  },
  {
    id: "hr",
    name: "HR",
    icon: "badge",
    labels: [
      { name: "Resume", icon: "person" },
      { name: "CV", icon: "person" },
      { name: "Cover letter", icon: "mail" },
      { name: "Job description", icon: "topic" },
      { name: "Job application", icon: "note-add" },
      { name: "Offer letter", icon: "work" },
      { name: "Onboarding document", icon: "badge" },
      { name: "Employee handbook", icon: "menu-book" },
      { name: "HR policy", icon: "policy" },
      { name: "Performance review", icon: "monitoring" },
      { name: "Timesheet", icon: "schedule" },
      { name: "Leave request", icon: "event" },
      { name: "Resignation letter", icon: "mail" },
      { name: "Termination letter", icon: "send" },
      { name: "Reference letter", icon: "contact-page" },
      { name: "Recommendation letter", icon: "how-to-reg" },
      { name: "Training material", icon: "school" },
      { name: "Organization chart", icon: "supervisor-account" },
      { name: "Benefits summary", icon: "health-and-safety" },
      { name: "HR memo", icon: "sticky-note-2" },
    ],
  },
  {
    id: "correspondence",
    name: "Correspondence",
    icon: "mail",
    labels: [
      { name: "Letter", icon: "mail" },
      { name: "Email thread", icon: "alternate-email" },
      { name: "Memo", icon: "sticky-note-2" },
      { name: "Meeting minutes", icon: "groups" },
      { name: "Meeting agenda", icon: "checklist" },
      { name: "Newsletter", icon: "newspaper" },
      { name: "Announcement", icon: "campaign" },
      { name: "Notice", icon: "campaign" },
      { name: "Public notice", icon: "public" },
      { name: "Press release", icon: "campaign" },
      { name: "Complaint letter", icon: "forum" },
      { name: "Demand letter", icon: "mail" },
      { name: "Confirmation letter", icon: "mail" },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    icon: "monitoring",
    labels: [
      { name: "Report", icon: "bar-chart" },
      { name: "Progress report", icon: "timeline" },
      { name: "Status report", icon: "monitoring" },
      { name: "Incident report", icon: "emergency" },
      { name: "Inspection report", icon: "fact-check" },
      { name: "Survey results", icon: "pie-chart" },
      { name: "Market research", icon: "insights" },
      { name: "Case study", icon: "article" },
      { name: "White paper", icon: "library-books" },
      { name: "Research paper", icon: "science" },
      { name: "Research abstract", icon: "text-snippet" },
      { name: "Feasibility study", icon: "architecture" },
      { name: "Risk assessment", icon: "security" },
      { name: "Analytics report", icon: "analytics" },
      { name: "Sales report", icon: "trending-up" },
      { name: "Expense summary", icon: "pie-chart" },
      { name: "Board report", icon: "groups" },
      { name: "Sustainability report", icon: "eco" },
    ],
  },
  {
    id: "operations",
    name: "Operations",
    icon: "local-shipping",
    labels: [
      { name: "Standard operating procedure", icon: "rule" },
      { name: "Work instruction", icon: "checklist" },
      { name: "Manual", icon: "menu-book" },
      { name: "User guide", icon: "auto-stories" },
      { name: "Quick start guide", icon: "menu-book" },
      { name: "Checklist", icon: "checklist" },
      { name: "Inventory list", icon: "inventory-2" },
      { name: "Stock report", icon: "warehouse" },
      { name: "Packing slip", icon: "package-2" },
      { name: "Delivery note", icon: "local-shipping" },
      { name: "Bill of lading", icon: "pallet" },
      { name: "Waybill", icon: "map" },
      { name: "Customs declaration", icon: "flight" },
      { name: "Customs form", icon: "assignment" },
      { name: "Freight document", icon: "forklift" },
      { name: "Shipping confirmation", icon: "send" },
      { name: "Supply order", icon: "shopping-cart" },
      { name: "Work order", icon: "task" },
      { name: "Maintenance log", icon: "build" },
      { name: "Service report", icon: "engineering" },
      { name: "Quality report", icon: "verified" },
      { name: "Safety data sheet", icon: "health-and-safety" },
      { name: "Safety procedure", icon: "health-and-safety" },
      { name: "Warehouse receipt", icon: "inventory-2" },
      { name: "Return authorization", icon: "redeem" },
    ],
  },
  {
    id: "sales",
    name: "Marketing",
    icon: "campaign",
    labels: [
      { name: "Proposal", icon: "slideshow" },
      { name: "Business proposal", icon: "business-center" },
      { name: "Sales proposal", icon: "trending-up" },
      { name: "Pitch deck", icon: "leaderboard" },
      { name: "Presentation", icon: "slideshow" },
      { name: "Brochure", icon: "image" },
      { name: "Flyer", icon: "palette" },
      { name: "Catalog", icon: "menu-book" },
      { name: "Product sheet", icon: "description" },
      { name: "Marketing plan", icon: "campaign" },
      { name: "Campaign brief", icon: "campaign" },
      { name: "Media kit", icon: "photo-camera" },
      { name: "Promotional material", icon: "celebration" },
      { name: "Advertisement", icon: "campaign" },
      { name: "Request for proposal", icon: "assignment" },
      { name: "Request for quotation", icon: "request-quote" },
      { name: "Tender document", icon: "assignment" },
      { name: "Statement of work", icon: "task" },
      { name: "Scope of work", icon: "task" },
    ],
  },
  {
    id: "engineering",
    name: "Engineering",
    icon: "engineering",
    labels: [
      { name: "Specification", icon: "engineering" },
      { name: "Technical specification", icon: "code" },
      { name: "Requirements document", icon: "checklist" },
      { name: "Design document", icon: "design-services" },
      { name: "Architecture document", icon: "architecture" },
      { name: "Datasheet", icon: "table-chart" },
      { name: "Schematic", icon: "bolt" },
      { name: "Blueprint", icon: "construction" },
      { name: "Technical drawing", icon: "engineering" },
      { name: "Floor plan", icon: "apartment" },
      { name: "Patent", icon: "copyright" },
      { name: "Test plan", icon: "checklist" },
      { name: "Test report", icon: "fact-check" },
      { name: "Release notes", icon: "article" },
      { name: "Change log", icon: "edit-document" },
      { name: "API documentation", icon: "api" },
      { name: "Bill of materials", icon: "inventory-2" },
    ],
  },
  {
    id: "projects",
    name: "Projects",
    icon: "task",
    labels: [
      { name: "Business plan", icon: "business-center" },
      { name: "Project plan", icon: "task" },
      { name: "Project charter", icon: "task" },
      { name: "Roadmap", icon: "trending-up" },
      { name: "Timeline", icon: "timeline" },
      { name: "Meeting notes", icon: "sticky-note-2" },
      { name: "Action plan", icon: "checklist" },
      { name: "Retrospective", icon: "psychology" },
    ],
  },
  {
    id: "education",
    name: "Education",
    icon: "school",
    labels: [
      { name: "Transcript", icon: "school" },
      { name: "Diploma", icon: "history-edu" },
      { name: "Certificate", icon: "verified" },
      { name: "Certificate of completion", icon: "verified" },
      { name: "Course syllabus", icon: "menu-book" },
      { name: "Lesson plan", icon: "school" },
      { name: "Assignment brief", icon: "assignment" },
      { name: "Exam paper", icon: "assignment" },
      { name: "Grade report", icon: "school" },
      { name: "Thesis", icon: "science" },
      { name: "Dissertation", icon: "science" },
      { name: "Study guide", icon: "menu-book" },
      { name: "Academic record", icon: "school" },
    ],
  },
  {
    // Document types, not content detection.
    id: "health",
    name: "Medical",
    icon: "medical-services",
    labels: [
      { name: "Medical report", icon: "medical-services" },
      { name: "Lab report", icon: "science" },
      { name: "Radiology report", icon: "monitor-heart" },
      { name: "Pathology report", icon: "medical-information" },
      { name: "Prescription", icon: "medication" },
      { name: "Referral letter", icon: "stethoscope" },
      { name: "Discharge summary", icon: "medical-services" },
      { name: "Immunization record", icon: "vaccines" },
      { name: "Medical invoice", icon: "receipt-long" },
      { name: "Insurance policy", icon: "shield" },
      { name: "Insurance claim", icon: "security" },
      { name: "Insurance certificate", icon: "approval" },
      { name: "Explanation of benefits", icon: "medical-information" },
    ],
  },
  {
    id: "property",
    name: "Property",
    icon: "real-estate-agent",
    labels: [
      { name: "Property listing", icon: "real-estate-agent" },
      { name: "Appraisal report", icon: "real-estate-agent" },
      { name: "Home inspection report", icon: "home" },
      { name: "Title document", icon: "home-work" },
      { name: "Closing statement", icon: "real-estate-agent" },
      { name: "Tenancy agreement", icon: "home-work" },
      { name: "Eviction notice", icon: "gavel" },
      { name: "HOA document", icon: "home-work" },
      { name: "Utility bill", icon: "bolt" },
    ],
  },
  {
    id: "government",
    name: "Government",
    icon: "account-balance",
    labels: [
      { name: "Permit", icon: "approval" },
      { name: "License", icon: "verified" },
      { name: "Registration form", icon: "how-to-reg" },
      { name: "Application form", icon: "assignment" },
      { name: "Government notice", icon: "campaign" },
      { name: "Grant application", icon: "assignment" },
      { name: "Grant agreement", icon: "handshake" },
      { name: "Visa document", icon: "public" },
      { name: "Immigration document", icon: "badge" },
      { name: "Legal filing", icon: "balance" },
    ],
  },
  {
    id: "travel",
    name: "Travel",
    icon: "flight",
    labels: [
      { name: "Itinerary", icon: "map" },
      { name: "Travel itinerary", icon: "flight" },
      { name: "Booking confirmation", icon: "hotel" },
      { name: "Reservation", icon: "restaurant" },
      { name: "Ticket", icon: "confirmation-number" },
      { name: "Event agenda", icon: "calendar-month" },
      { name: "Event program", icon: "calendar-month" },
      { name: "Invitation", icon: "mail" },
      { name: "Registration confirmation", icon: "fact-check" },
    ],
  },
  {
    id: "forms",
    name: "Forms",
    icon: "assignment",
    labels: [
      { name: "Form", icon: "assignment" },
      { name: "Questionnaire", icon: "assignment" },
      { name: "Survey form", icon: "checklist" },
      { name: "Feedback form", icon: "forum" },
      { name: "Intake form", icon: "assignment" },
      { name: "Order form", icon: "shopping-cart" },
      { name: "Claim form", icon: "assignment" },
      { name: "Warranty document", icon: "assured-workload" },
      { name: "Membership document", icon: "badge" },
      { name: "Subscription confirmation", icon: "fact-check" },
      { name: "Gift certificate", icon: "redeem" },
      { name: "Sponsorship agreement", icon: "handshake" },
      { name: "Petition", icon: "history-edu" },
      { name: "Agenda", icon: "checklist" },
      { name: "Fact sheet", icon: "summarize" },
      { name: "FAQ document", icon: "chat" },
      { name: "Glossary", icon: "menu-book" },
      { name: "Index", icon: "format-list-bulleted" },
      { name: "Table of contents", icon: "topic" },
    ],
  },
];

/**
 * Built-in families with a derived stable `id` on every label. Authored in
 * RAW_LABEL_FAMILIES (id-free); the id is `labelId(name)`. Throws at module load
 * if two labels collapse to the same id, so a clash can't ship silently.
 */
export const LABEL_FAMILIES: LabelFamily[] = (() => {
  const seen = new Set<string>();
  return RAW_LABEL_FAMILIES.map((family) => ({
    ...family,
    labels: family.labels.map((label) => {
      const id = labelId(label.name);
      if (seen.has(id)) {
        throw new Error(
          `Duplicate classification label id "${id}" (from "${label.name}")`,
        );
      }
      seen.add(id);
      return { id, name: label.name, icon: label.icon };
    }),
  }));
})();

/** Flat default label set — family order, as the classifier/team-seed sees it. */
export const DEFAULT_CLASSIFICATION_LABELS: ClassificationLabel[] =
  LABEL_FAMILIES.flatMap((family) => family.labels);
