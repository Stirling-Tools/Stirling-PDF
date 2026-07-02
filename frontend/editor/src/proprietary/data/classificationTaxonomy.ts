/**
 * Document-classification vocabulary — the single, type-safe source of truth.
 *
 * The Python engine can't import TypeScript, so this is GENERATED into
 * `engine/src/stirling/agents/default_classification_taxonomy.generated.json` by
 * `editor/scripts/generate-classification-taxonomy.mts`
 * (`task frontend:classifier-categories`, drift-guarded by
 * `task frontend:classifier-categories:check`). Edit THIS file, never the
 * generated JSON.
 *
 * Shape mirrors the engine's `ClassificationTaxonomy` contract; the camelCase
 * keys here map onto that model's aliases.
 *
 * Override points for later (kept simple now, designed to drop in):
 *  - This is the built-in DEFAULT. A per-org / DB-configured taxonomy is meant to
 *    layer on top, not replace this file.
 *  - The engine already accepts a `taxonomy` per classify request; when one is
 *    supplied it wins, and this default is the fallback.
 *  - The backend `ClassifyTagController.resolveTaxonomyOverride()` is the seam to
 *    load the caller's org/DB taxonomy and pass it through; today it returns none.
 */

/** A specific instrument within a category — category-scoped (e.g. `nda` only
 *  under `contract`); the engine enforces it can't apply to another category. */
export interface DocumentType {
  id: string;
  label: string;
}

export interface DocumentCategory {
  id: string;
  label: string;
  /** Category-scoped tags. */
  docTypes: DocumentType[];
}

export interface ClassificationTaxonomy {
  /** Ordered most-common → least-common. */
  categories: DocumentCategory[];
  /** Loose, cross-cutting tags that aren't tied to any single category. */
  tags: string[];
}

export const DEFAULT_CLASSIFICATION_TAXONOMY: ClassificationTaxonomy = {
  categories: [
    {
      id: "invoice",
      label: "Invoice",
      docTypes: [
        { id: "invoice", label: "Invoice" },
        { id: "receipt", label: "Receipt" },
        { id: "credit_note", label: "Credit note" },
        { id: "purchase_order", label: "Purchase order" },
        { id: "quote", label: "Quote" },
      ],
    },
    {
      id: "contract",
      label: "Contract",
      docTypes: [
        { id: "nda", label: "Non-disclosure agreement" },
        { id: "employment_agreement", label: "Employment agreement" },
        { id: "service_agreement", label: "Service agreement" },
        { id: "lease_agreement", label: "Lease agreement" },
        { id: "master_service_agreement", label: "Master service agreement" },
        { id: "statement_of_work", label: "Statement of work" },
        { id: "terms_of_service", label: "Terms of service" },
      ],
    },
    {
      id: "financial_statement",
      label: "Financial statement",
      docTypes: [
        { id: "balance_sheet", label: "Balance sheet" },
        { id: "income_statement", label: "Income statement" },
        { id: "cash_flow_statement", label: "Cash flow statement" },
        { id: "bank_statement", label: "Bank statement" },
        { id: "annual_report", label: "Annual report" },
      ],
    },
    {
      id: "report",
      label: "Report",
      docTypes: [
        { id: "business_report", label: "Business report" },
        { id: "project_report", label: "Project report" },
        { id: "research_report", label: "Research report" },
        { id: "status_report", label: "Status report" },
        { id: "incident_report", label: "Incident report" },
      ],
    },
    {
      id: "letter",
      label: "Letter",
      docTypes: [
        { id: "business_letter", label: "Business letter" },
        { id: "cover_letter", label: "Cover letter" },
        { id: "recommendation_letter", label: "Recommendation letter" },
        { id: "complaint_letter", label: "Complaint letter" },
        { id: "demand_letter", label: "Demand letter" },
      ],
    },
    {
      id: "form",
      label: "Form",
      docTypes: [
        { id: "application_form", label: "Application form" },
        { id: "registration_form", label: "Registration form" },
        { id: "consent_form", label: "Consent form" },
        { id: "survey", label: "Survey" },
        { id: "questionnaire", label: "Questionnaire" },
      ],
    },
    {
      id: "resume",
      label: "Resume",
      docTypes: [
        { id: "resume", label: "Resume" },
        { id: "curriculum_vitae", label: "Curriculum vitae" },
        { id: "portfolio", label: "Portfolio" },
        { id: "reference_sheet", label: "Reference sheet" },
      ],
    },
    {
      id: "tax_form",
      label: "Tax form",
      docTypes: [
        { id: "tax_return", label: "Tax return" },
        { id: "w2", label: "W-2" },
        { id: "w9", label: "W-9" },
        { id: "form_1099", label: "Form 1099" },
        { id: "vat_return", label: "VAT return" },
      ],
    },
    {
      id: "expense_report",
      label: "Expense report",
      docTypes: [
        { id: "expense_report", label: "Expense report" },
        { id: "reimbursement_request", label: "Reimbursement request" },
        { id: "mileage_log", label: "Mileage log" },
        { id: "per_diem_claim", label: "Per diem claim" },
      ],
    },
    {
      id: "presentation",
      label: "Presentation",
      docTypes: [
        { id: "slide_deck", label: "Slide deck" },
        { id: "pitch_deck", label: "Pitch deck" },
        { id: "training_deck", label: "Training deck" },
        { id: "webinar_deck", label: "Webinar deck" },
      ],
    },
    {
      id: "medical_record",
      label: "Medical record",
      docTypes: [
        { id: "lab_result", label: "Lab result" },
        { id: "prescription", label: "Prescription" },
        { id: "discharge_summary", label: "Discharge summary" },
        { id: "medical_history", label: "Medical history" },
        { id: "imaging_report", label: "Imaging report" },
        { id: "vaccination_record", label: "Vaccination record" },
      ],
    },
    {
      id: "legal_filing",
      label: "Legal filing",
      docTypes: [
        { id: "court_filing", label: "Court filing" },
        { id: "complaint", label: "Complaint" },
        { id: "motion", label: "Motion" },
        { id: "subpoena", label: "Subpoena" },
        { id: "affidavit", label: "Affidavit" },
        { id: "deposition", label: "Deposition" },
      ],
    },
    {
      id: "identity_document",
      label: "Identity document",
      docTypes: [
        { id: "passport", label: "Passport" },
        { id: "drivers_license", label: "Driver's license" },
        { id: "national_id", label: "National ID" },
        { id: "birth_certificate", label: "Birth certificate" },
        { id: "visa", label: "Visa" },
      ],
    },
    {
      id: "insurance",
      label: "Insurance",
      docTypes: [
        { id: "insurance_policy", label: "Insurance policy" },
        { id: "insurance_claim", label: "Insurance claim" },
        { id: "certificate_of_insurance", label: "Certificate of insurance" },
        { id: "explanation_of_benefits", label: "Explanation of benefits" },
      ],
    },
    {
      id: "real_estate",
      label: "Real estate",
      docTypes: [
        { id: "deed", label: "Deed" },
        { id: "mortgage_agreement", label: "Mortgage agreement" },
        { id: "property_appraisal", label: "Property appraisal" },
        { id: "closing_disclosure", label: "Closing disclosure" },
        { id: "title_report", label: "Title report" },
      ],
    },
    {
      id: "shipping",
      label: "Shipping",
      docTypes: [
        { id: "bill_of_lading", label: "Bill of lading" },
        { id: "packing_slip", label: "Packing slip" },
        { id: "customs_declaration", label: "Customs declaration" },
        { id: "delivery_note", label: "Delivery note" },
        { id: "air_waybill", label: "Air waybill" },
      ],
    },
    {
      id: "hr_document",
      label: "HR document",
      docTypes: [
        { id: "offer_letter", label: "Offer letter" },
        { id: "performance_review", label: "Performance review" },
        { id: "payslip", label: "Payslip" },
        { id: "employee_handbook", label: "Employee handbook" },
        { id: "termination_letter", label: "Termination letter" },
        { id: "timesheet", label: "Timesheet" },
      ],
    },
    {
      id: "academic_record",
      label: "Academic record",
      docTypes: [
        { id: "transcript", label: "Transcript" },
        { id: "diploma", label: "Diploma" },
        { id: "certificate", label: "Certificate" },
        { id: "syllabus", label: "Syllabus" },
        { id: "thesis", label: "Thesis" },
        { id: "report_card", label: "Report card" },
      ],
    },
    {
      id: "marketing_material",
      label: "Marketing material",
      docTypes: [
        { id: "brochure", label: "Brochure" },
        { id: "flyer", label: "Flyer" },
        { id: "case_study", label: "Case study" },
        { id: "white_paper", label: "White paper" },
        { id: "press_release", label: "Press release" },
      ],
    },
    {
      id: "technical_document",
      label: "Technical document",
      docTypes: [
        { id: "user_manual", label: "User manual" },
        { id: "specification", label: "Specification" },
        { id: "api_documentation", label: "API documentation" },
        { id: "installation_guide", label: "Installation guide" },
        { id: "datasheet", label: "Datasheet" },
        { id: "release_notes", label: "Release notes" },
      ],
    },
  ],
  tags: [
    "finance",
    "legal",
    "medical",
    "hr",
    "tax",
    "insurance",
    "marketing",
    "technical",
    "operations",
    "academic",
    "government",
    "draft",
    "final",
    "signed",
    "unsigned",
    "executed",
    "expired",
    "amended",
    "void",
    "confidential",
    "internal",
    "public",
    "pii",
    "phi",
    "certified",
    "notarized",
    "scanned",
    "redacted",
    "template",
    "urgent",
  ],
};
