/**
 * The Stirling endpoint catalogue.
 *
 * Document types are grouped by vertical (Insurance, Finance, Legal, …).
 * Each entry carries the route path, tier gate, JSON-shape schema, supported
 * regions, and a category accent. The catalogue is the spine the Docs view,
 * the Pipelines composer, and the Document type grid on Home all read from.
 *
 * Ported faithfully from the prototype's DOCUMENT_TYPES. Schema field shapes
 * are kept as the prototype-style "type-or-list-of-type" string for now; a
 * future revision should convert them to Zod schemas so they double as
 * runtime validators.
 */

import type { Tier } from "@shared/tokens/tokens";

/** Canonical vertical keys — these map 1:1 to category-accent CSS variables. */
export type VerticalKey =
  | "insurance"
  | "compliance"
  | "finance"
  | "legal"
  | "healthcare"
  | "government"
  | "operations"
  | "hr"
  | "realestate"
  | "energy";

/**
 * Numeric tier requirement on an endpoint.
 *   0 = free
 *   1 = paid (pro / pay-as-you-go and above)
 *   2 = enterprise only
 *
 * Use `isEndpointAvailable(endpoint, currentTier)` for runtime checks rather
 * than comparing numbers directly.
 */
export type EndpointTierGate = 0 | 1 | 2;

export interface EndpointSchema {
  /**
   * Prototype-style field shape. Strings like "string", "number", "date",
   * "boolean", "string?" (optional), "[string]" (array), or an inline shape
   * "{start, end}". Replace with a Zod schema when wiring up real requests.
   */
  [field: string]: string;
}

export interface Endpoint {
  /** Display name shown in cards and docs. */
  name: string;
  /** Route path mounted under the Stirling API. */
  endpoint: string;
  /** Numeric tier gate, see {@link EndpointTierGate}. */
  tier: EndpointTierGate;
  /** One-line description used in cards and docs index. */
  desc: string;
  /** Vertical this endpoint belongs to. */
  vertical: VerticalKey;
  /** Region availability list. "+22" tail means "and N more regions". */
  regions: readonly string[];
  /** Endpoint payload shape. */
  schema: EndpointSchema;
}

export interface Vertical {
  key: VerticalKey;
  label: string;
  /** CSS-variable reference for the category accent. */
  color: string;
  endpoints: readonly Endpoint[];
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Catalogue                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

const insurance: readonly Endpoint[] = [
  {
    name: "Certificates of Insurance",
    endpoint: "/v1/coi",
    tier: 1,
    vertical: "insurance",
    desc: "Live compliance dashboard with coverage gaps, renewal alerts, and AI Q&A for policy verification",
    regions: ["US", "UK", "CA", "AU", "+22"],
    schema: {
      holder: "string",
      insurer: "string",
      policy_number: "string",
      coverage_types: "[string]",
      general_aggregate: "number",
      expiry_date: "date",
      additional_insured: "boolean",
    },
  },
  {
    name: "Loss Run Reports",
    endpoint: "/v1/loss-run",
    tier: 1,
    vertical: "insurance",
    desc: "Claims timeline with loss ratio trends, carrier comparisons, and underwriting AI chat",
    regions: ["US", "UK", "CA"],
    schema: {
      carrier: "string",
      policy_period: "string",
      total_claims: "number",
      total_incurred: "number",
      loss_ratio: "number",
      claims: "[{date, type, incurred, status}]",
    },
  },
  {
    name: "ACORD Forms",
    endpoint: "/v1/acord",
    tier: 1,
    vertical: "insurance",
    desc: "Multi-carrier coverage view with ACORD compliance badges and reconciliation actions",
    regions: ["US"],
    schema: {
      form_number: "string",
      producer: "string",
      insured: "string",
      carriers: "[{name, naic, policy}]",
      coverages: "[{type, limit, deductible}]",
      effective_date: "date",
    },
  },
  {
    name: "Declarations Pages",
    endpoint: "/v1/dec-page",
    tier: 1,
    vertical: "insurance",
    desc: "Coverage summary with gap highlights, endorsement changes, and premium calculator",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      named_insured: "string",
      policy_number: "string",
      effective: "date",
      expiry: "date",
      coverages: "[{type, limit, deductible, premium}]",
      total_premium: "number",
      endorsements: "[string]",
    },
  },
  {
    name: "Explanation of Benefits",
    endpoint: "/v1/eob",
    tier: 1,
    vertical: "insurance",
    desc: "Benefit breakdown with denial codes, patient cost visibility, and billing action buttons",
    regions: ["US"],
    schema: {
      patient: "string",
      provider: "string",
      service_date: "date",
      services: "[{code, description, billed, allowed, paid, patient_resp}]",
      denial_codes: "[string]?",
      total_patient_owed: "number",
    },
  },
  {
    name: "Subrogation Notices",
    endpoint: "/v1/subrogation",
    tier: 1,
    vertical: "insurance",
    desc: "Recovery opportunity tracker with status updates, lien tracking, and settlement AI",
    regions: ["US", "UK"],
    schema: {
      claim_number: "string",
      claimant: "string",
      liable_party: "string",
      loss_date: "date",
      recovery_sought: "number",
      lien_amount: "number?",
      status: "string",
    },
  },
  {
    name: "Surety Bonds",
    endpoint: "/v1/surety-bond",
    tier: 1,
    vertical: "insurance",
    desc: "Bond status dashboard showing obligee requirements, renewal dates, and compliance checklist",
    regions: ["US", "UK", "CA", "AU", "+14"],
    schema: {
      bond_number: "string",
      principal: "string",
      obligee: "string",
      surety: "string",
      bond_amount: "number",
      effective_date: "date",
      expiry_date: "date",
      bond_type: "string",
    },
  },
];

const compliance: readonly Endpoint[] = [
  {
    name: "SOC 2 Reports",
    endpoint: "/v1/soc2",
    tier: 1,
    vertical: "compliance",
    desc: "Control assessment view with exception severity ratings, trust criteria status, and remediation notes",
    regions: ["US", "Global"],
    schema: {
      report_type: "string",
      service_org: "string",
      auditor: "string",
      period: "{start, end}",
      opinion: "string",
      exceptions: "[{control, description}]",
      trust_criteria: "[string]",
    },
  },
  {
    name: "Regulatory Filings",
    endpoint: "/v1/regulatory-filing",
    tier: 1,
    vertical: "compliance",
    desc: "Multi-jurisdiction filing calendar with deadline alerts, status tracking, and submission buttons",
    regions: ["US", "UK", "EU", "SG", "HK", "+31"],
    schema: {
      filing_type: "string",
      jurisdiction: "string",
      entity: "string",
      filing_date: "date",
      deadline: "date",
      status: "string",
      reference_number: "string?",
    },
  },
  {
    name: "Consent Orders",
    endpoint: "/v1/consent-order",
    tier: 1,
    vertical: "compliance",
    desc: "Violation timeline with remediation progress bars, deadline countdowns, and compliance history",
    regions: ["US", "UK", "EU"],
    schema: {
      regulatory_body: "string",
      respondent: "string",
      order_date: "date",
      violations: "[{statute, description}]",
      penalties: "number",
      remediation: "[string]",
      compliance_deadline: "date",
    },
  },
  {
    name: "GDPR Processing Agreements",
    endpoint: "/v1/dpa",
    tier: 1,
    vertical: "compliance",
    desc: "Data processing overview with transfer mechanism validation, sub-processor registry, and approval flow",
    regions: ["EU", "UK", "CH", "Global"],
    schema: {
      controller: "string",
      processor: "string",
      data_categories: "[string]",
      purposes: "[string]",
      sub_processors: "[{name, location}]",
      transfer_mechanism: "string",
      retention_period: "string",
    },
  },
  {
    name: "Sanctions Screening Results",
    endpoint: "/v1/sanctions-screen",
    tier: 1,
    vertical: "compliance",
    desc: "Real-time screening results with match confidence scores and one-click disposition",
    regions: ["US", "UK", "EU", "Global"],
    schema: {
      screened_entity: "string",
      lists_checked: "[string]",
      matches: "[{list, name, score, type}]",
      overall_risk: "string",
      disposition: "string",
      screened_date: "date",
    },
  },
  {
    name: "ISO Audit Reports",
    endpoint: "/v1/iso-audit",
    tier: 1,
    vertical: "compliance",
    desc: "Audit findings organized by severity with remediation timelines and compliance tracking",
    regions: ["Global"],
    schema: {
      standard: "string",
      audit_type: "string",
      auditor: "string",
      organization: "string",
      nonconformities: "[{clause, severity, finding}]",
      observations: "[string]",
      recommendation: "string",
    },
  },
  {
    name: "Incident Reports",
    endpoint: "/v1/incident-report",
    tier: 1,
    vertical: "compliance",
    desc: "Incident severity dashboard with root cause analysis, remediation tracking, and escalation status",
    regions: ["Global"],
    schema: {
      incident_id: "string",
      date: "date",
      severity: "string",
      category: "string",
      description: "string",
      root_cause: "string?",
      remediation: "string?",
      reported_by: "string",
    },
  },
];

const finance: readonly Endpoint[] = [
  {
    name: "Letters of Credit",
    endpoint: "/v1/loc",
    tier: 1,
    vertical: "finance",
    desc: "LC tracker with condition verification, expiry alerts, and cash call risk assessment",
    regions: ["US", "UK", "HK", "SG", "+34"],
    schema: {
      lc_number: "string",
      issuing_bank: "string",
      applicant: "string",
      beneficiary: "string",
      amount: "number",
      currency: "string",
      conditions: "[string]",
      expiry_date: "date",
      type: "string",
    },
  },
  {
    name: "Trade Confirmations",
    endpoint: "/v1/trade-confirm",
    tier: 1,
    vertical: "finance",
    desc: "Trade confirmation with counterparty validation, settlement date verification, and matching status",
    regions: ["US", "UK", "EU", "HK", "JP", "+18"],
    schema: {
      trade_date: "date",
      settlement_date: "date",
      security: "string",
      identifier: "string",
      quantity: "number",
      price: "number",
      counterparty: "string",
      account: "string",
    },
  },
  {
    name: "Fund Prospectuses",
    endpoint: "/v1/prospectus",
    tier: 1,
    vertical: "finance",
    desc: "Fund profile with fee breakdown, risk level compliance checks, and mandate alignment flags",
    regions: ["US", "UK", "EU", "LU", "+12"],
    schema: {
      fund_name: "string",
      fund_type: "string",
      objective: "string",
      expense_ratio: "number",
      risk_level: "string",
      min_investment: "number",
      performance: "[{period, return}]",
      manager: "string",
    },
  },
  {
    name: "K-1 Schedules",
    endpoint: "/v1/k1",
    tier: 1,
    vertical: "finance",
    desc: "Partnership income view with equity reconciliation, distribution tracking, and tax line mapping",
    regions: ["US"],
    schema: {
      partnership: "string",
      partner: "string",
      tax_year: "number",
      ordinary_income: "number",
      rental_income: "number?",
      interest_income: "number?",
      capital_gains: "number?",
      distributions: "number",
      capital_account: "number",
    },
  },
  {
    name: "10-K / Annual Reports",
    endpoint: "/v1/10k",
    tier: 1,
    vertical: "finance",
    desc: "Financial summary with risk factor highlights, year-over-year comparisons, and segment performance",
    regions: ["US", "UK", "EU", "JP", "+8"],
    schema: {
      entity: "string",
      fiscal_year: "number",
      revenue: "number",
      net_income: "number",
      total_assets: "number",
      risk_factors: "[string]",
      segments: "[{name, revenue}]",
      auditor: "string",
    },
  },
  {
    name: "Bank Statements",
    endpoint: "/v1/bank-statement",
    tier: 1,
    vertical: "finance",
    desc: "Transaction timeline with anomaly detection, balance reconciliation, and cash flow insights",
    regions: ["US", "UK", "EU", "CA", "AU", "+41"],
    schema: {
      institution: "string",
      account_last_4: "string",
      period: "{start, end}",
      opening_balance: "number",
      closing_balance: "number",
      transactions: "[{date, desc, amount, balance}]",
    },
  },
  {
    name: "Invoices",
    endpoint: "/v1/invoice",
    tier: 1,
    vertical: "finance",
    desc: "Three-way match status, approval actions, and AI chat for line-item disputes",
    regions: ["US", "UK", "EU", "DE", "JP", "BR", "+52"],
    schema: {
      vendor_name: "string",
      invoice_number: "string",
      date: "date",
      line_items: "[{desc, qty, unit_price, total}]",
      subtotal: "number",
      tax: "number",
      total: "number",
      payment_terms: "string",
    },
  },
];

const legal: readonly Endpoint[] = [
  {
    name: "Contracts",
    endpoint: "/v1/contract",
    tier: 1,
    vertical: "legal",
    desc: "Clause-by-clause risk highlights, renewal countdown, and negotiation AI",
    regions: ["Global"],
    schema: {
      parties: "[{name, role}]",
      effective_date: "date",
      term_months: "number",
      renewal: "string",
      governing_law: "string",
      signature_status: "string",
    },
  },
  {
    name: "Court Filings",
    endpoint: "/v1/court-filing",
    tier: 1,
    vertical: "legal",
    desc: "Docket event timeline with deadline alerts, motion status, and counsel response tracking",
    regions: ["US", "UK", "CA", "AU", "+16"],
    schema: {
      case_number: "string",
      court: "string",
      parties: "[{name, role}]",
      filing_date: "date",
      document_class: "string",
      docket_entries: "[{date, description}]",
    },
  },
  {
    name: "Corporate Formation Docs",
    endpoint: "/v1/corp-formation",
    tier: 1,
    vertical: "legal",
    desc: "Entity status dashboard with good standing checks, officer compliance, and filing tracker",
    regions: ["US", "UK", "DE", "SG", "HK", "+28"],
    schema: {
      entity_name: "string",
      entity_type: "string",
      jurisdiction: "string",
      formation_date: "date",
      officers: "[{name, title}]",
      registered_agent: "string",
      authorized_shares: "number?",
    },
  },
  {
    name: "UCC Filings",
    endpoint: "/v1/ucc",
    tier: 1,
    vertical: "legal",
    desc: "UCC status view with lapse countdown, priority verification, and collateral tracking",
    regions: ["US"],
    schema: {
      filing_number: "string",
      filing_date: "date",
      secured_party: "string",
      debtor: "string",
      collateral: "string",
      filing_office: "string",
      status: "string",
      lapse_date: "date",
    },
  },
  {
    name: "Powers of Attorney",
    endpoint: "/v1/poa",
    tier: 1,
    vertical: "legal",
    desc: "Agent authority scope with durable status verification, witness records, and action permissions",
    regions: ["US", "UK", "EU", "Global"],
    schema: {
      principal: "string",
      agent: "string",
      scope: "[string]",
      effective_date: "date",
      durable: "boolean",
      expiry_date: "date?",
      witnesses: "[string]",
    },
  },
  {
    name: "Patent Applications",
    endpoint: "/v1/patent",
    tier: 1,
    vertical: "legal",
    desc: "Patent prosecution timeline with office action tracking, fee deadlines, and claim status",
    regions: ["US", "EU", "JP", "CN", "KR", "+8"],
    schema: {
      application_number: "string",
      title: "string",
      inventors: "[string]",
      assignee: "string",
      priority_date: "date",
      classifications: "[string]",
      claims_count: "number",
      status: "string",
    },
  },
];

const healthcare: readonly Endpoint[] = [
  {
    name: "Prior Authorizations",
    endpoint: "/v1/prior-auth",
    tier: 1,
    vertical: "healthcare",
    desc: "Decision tracking, medical necessity AI, and automatic payer follow-up notifications",
    regions: ["US"],
    schema: {
      patient_id: "string",
      provider_npi: "string",
      payer: "string",
      procedure_codes: "[string]",
      diagnosis_codes: "[string]",
      medical_necessity: "string",
      decision: "string",
      auth_number: "string?",
    },
  },
  {
    name: "Discharge Summaries",
    endpoint: "/v1/discharge",
    tier: 1,
    vertical: "healthcare",
    desc: "Discharge plan with follow-up order checklist, medication list, and continuity of care actions",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      patient_id: "string",
      admission_date: "date",
      discharge_date: "date",
      diagnoses: "[{code, description}]",
      procedures: "[string]",
      medications: "[{name, dose, frequency}]",
      follow_up: "[string]",
    },
  },
  {
    name: "Clinical Trial Documents",
    endpoint: "/v1/clinical-trial",
    tier: 1,
    vertical: "healthcare",
    desc: "Trial progress view with enrollment metrics, site performance, and endpoint tracking",
    regions: ["US", "EU", "UK", "JP", "+12"],
    schema: {
      trial_id: "string",
      phase: "string",
      sponsor: "string",
      indication: "string",
      primary_endpoint: "string",
      enrollment: "number",
      sites: "number",
      status: "string",
    },
  },
  {
    name: "FDA Submissions",
    endpoint: "/v1/fda-submission",
    tier: 1,
    vertical: "healthcare",
    desc: "Submission status timeline with decision tracking, reviewer feedback, and compliance alerts",
    regions: ["US"],
    schema: {
      submission_type: "string",
      submission_number: "string",
      applicant: "string",
      product_name: "string",
      classification: "string",
      predicate_device: "string?",
      decision: "string",
      decision_date: "date?",
    },
  },
  {
    name: "Pathology Reports",
    endpoint: "/v1/pathology",
    tier: 1,
    vertical: "healthcare",
    desc: "Pathology summary with diagnostic alerts, biomarker results, and tumor board routing",
    regions: ["US", "UK", "EU", "Global"],
    schema: {
      patient_id: "string",
      specimen_type: "string",
      diagnosis: "string",
      staging: "string?",
      margins: "string",
      biomarkers: "[{marker, result}]",
      pathologist: "string",
    },
  },
  {
    name: "Patient Intake Forms",
    endpoint: "/v1/patient-intake",
    tier: 1,
    vertical: "healthcare",
    desc: "Patient profile with allergy alerts, medication conflict detection, and insurance verification",
    regions: ["US", "UK", "CA", "AU", "+18"],
    schema: {
      patient_name: "string",
      dob: "date",
      insurance_provider: "string",
      policy_number: "string",
      allergies: "[string]",
      medications: "[string]",
      chief_complaint: "string",
    },
  },
];

const government: readonly Endpoint[] = [
  {
    name: "Tax Forms",
    endpoint: "/v1/tax-form",
    tier: 1,
    vertical: "government",
    desc: "Tax liability view with filing deadline alerts, jurisdiction tracker, and e-file actions",
    regions: ["US", "UK", "DE", "FR", "BR", "JP", "IN", "+43"],
    schema: {
      form_type: "string",
      jurisdiction: "string",
      tax_year: "number",
      entity: "string",
      gross_income: "number",
      tax_withheld: "number",
      filing_status: "string",
    },
  },
  {
    name: "Permits & Licenses",
    endpoint: "/v1/permit",
    tier: 1,
    vertical: "government",
    desc: "Permit dashboard showing status, conditions, renewal dates, and compliance checklist",
    regions: ["US", "UK", "EU", "CA", "AU", "+32"],
    schema: {
      permit_type: "string",
      permit_number: "string",
      issuing_authority: "string",
      holder: "string",
      issue_date: "date",
      expiry_date: "date",
      conditions: "[string]",
      status: "string",
    },
  },
  {
    name: "Grant Applications",
    endpoint: "/v1/grant",
    tier: 1,
    vertical: "government",
    desc: "Grant status with approval workflow, funding milestones, and compliance audit tracking",
    regions: ["US", "UK", "EU"],
    schema: {
      applicant: "string",
      program: "string",
      amount_requested: "number",
      project_title: "string",
      period: "{start, end}",
      budget_categories: "[{category, amount}]",
      status: "string",
    },
  },
  {
    name: "FOIA Responses",
    endpoint: "/v1/foia",
    tier: 1,
    vertical: "government",
    desc: "Request status with exemption review, redaction tracker, and disclosure timeline",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      request_number: "string",
      agency: "string",
      requester: "string",
      responsive_pages: "number",
      redacted_pages: "number",
      exemptions_cited: "[string]",
      disposition: "string",
    },
  },
  {
    name: "Municipal Filings",
    endpoint: "/v1/municipal-filing",
    tier: 1,
    vertical: "government",
    desc: "Filing timeline with hearing date alerts, public comment deadline, and status updates",
    regions: ["US", "UK", "CA", "+18"],
    schema: {
      filing_type: "string",
      municipality: "string",
      applicant: "string",
      property_address: "string?",
      date: "date",
      status: "string",
      hearing_date: "date?",
    },
  },
  {
    name: "Customs Declarations",
    endpoint: "/v1/customs",
    tier: 1,
    vertical: "government",
    desc: "Customs entry view with HS code mapping, duty calculation, and tariff classification AI",
    regions: ["US", "UK", "EU", "CN", "JP", "SG", "+48"],
    schema: {
      entry_number: "string",
      importer: "string",
      country_origin: "string",
      items: "[{hs_code, description, value, duty}]",
      total_value: "number",
      total_duty: "number",
      port: "string",
    },
  },
];

const operations: readonly Endpoint[] = [
  {
    name: "Bills of Lading",
    endpoint: "/v1/bol",
    tier: 1,
    vertical: "operations",
    desc: "Shipping document view with incoterm validation, port tracking, and cargo checklist",
    regions: ["Global"],
    schema: {
      bol_number: "string",
      shipper: "string",
      consignee: "string",
      carrier: "string",
      vessel: "string?",
      port_loading: "string",
      port_discharge: "string",
      goods: "[{description, weight, packages}]",
    },
  },
  {
    name: "Certificates of Origin",
    endpoint: "/v1/cert-origin",
    tier: 1,
    vertical: "operations",
    desc: "Certificate details with tariff eligibility verification, rules of origin check, and compliance badges",
    regions: ["US", "EU", "UK", "MX", "CA", "+38"],
    schema: {
      certificate_number: "string",
      exporter: "string",
      importer: "string",
      country_origin: "string",
      goods: "[{description, hs_code, value}]",
      trade_agreement: "string?",
      issued_by: "string",
    },
  },
  {
    name: "Warehouse Receipts",
    endpoint: "/v1/warehouse-receipt",
    tier: 1,
    vertical: "operations",
    desc: "Warehouse inventory view with lien holder tracking, withdrawal requests, and storage timeline",
    regions: ["US", "UK", "EU", "+22"],
    schema: {
      receipt_number: "string",
      warehouse: "string",
      depositor: "string",
      goods: "[{description, quantity, unit}]",
      storage_date: "date",
      location: "string",
      lien_status: "string",
    },
  },
  {
    name: "Inspection Reports",
    endpoint: "/v1/inspection",
    tier: 1,
    vertical: "operations",
    desc: "Inspection findings with remediation actions, re-audit scheduling, and compliance status",
    regions: ["Global"],
    schema: {
      inspector: "string",
      date: "date",
      location: "string",
      findings: "[{item, status, note}]",
      overall_status: "string",
      next_inspection: "date?",
    },
  },
  {
    name: "Purchase Orders",
    endpoint: "/v1/purchase-order",
    tier: 1,
    vertical: "operations",
    desc: "PO status with approval workflow, invoice matching, and delivery tracking buttons",
    regions: ["Global"],
    schema: {
      po_number: "string",
      vendor: "string",
      date: "date",
      line_items: "[{desc, qty, unit_price, total}]",
      total: "number",
      delivery_terms: "string",
      approved_by: "string?",
    },
  },
  {
    name: "Packing Lists",
    endpoint: "/v1/packing-list",
    tier: 1,
    vertical: "operations",
    desc: "Shipment manifest with PO reconciliation, receiving report actions, and discrepancy alerts",
    regions: ["Global"],
    schema: {
      shipment_id: "string",
      shipper: "string",
      packages: "[{package_id, contents, weight, dimensions}]",
      total_packages: "number",
      total_weight: "string",
      po_reference: "string?",
    },
  },
];

const hr: readonly Endpoint[] = [
  {
    name: "I-9 / Right to Work",
    endpoint: "/v1/i9",
    tier: 1,
    vertical: "hr",
    desc: "Verification status with document validity tracking, expiry alerts, and re-verification scheduler",
    regions: ["US", "UK", "EU", "AU", "CA"],
    schema: {
      employee_name: "string",
      document_type: "string",
      document_number: "string",
      expiration_date: "date?",
      issuing_authority: "string",
      verified: "boolean",
    },
  },
  {
    name: "Employment Verification Letters",
    endpoint: "/v1/employment-verification",
    tier: 1,
    vertical: "hr",
    desc: "Employment history view with title verification, salary details, and underwriting status",
    regions: ["US", "UK", "CA", "AU", "+14"],
    schema: {
      employer: "string",
      employee: "string",
      start_date: "date",
      end_date: "date?",
      title: "string",
      salary: "number?",
      employment_status: "string",
    },
  },
  {
    name: "Workers Comp Claims",
    endpoint: "/v1/workers-comp",
    tier: 1,
    vertical: "hr",
    desc: "Claim status with injury timeline, return-to-work plan, and case management actions",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      claim_number: "string",
      employee: "string",
      injury_date: "date",
      injury_type: "string",
      body_part: "string",
      provider: "string",
      lost_days: "number",
      claim_status: "string",
    },
  },
  {
    name: "Benefits Enrollment",
    endpoint: "/v1/benefits-enrollment",
    tier: 1,
    vertical: "hr",
    desc: "Enrollment status with dependent tracking, plan comparison, and open enrollment countdown",
    regions: ["US", "UK", "CA"],
    schema: {
      employee: "string",
      plan_type: "string",
      coverage_tier: "string",
      dependents: "[{name, relationship}]",
      effective_date: "date",
      employee_contribution: "number",
    },
  },
  {
    name: "Separation Agreements",
    endpoint: "/v1/separation",
    tier: 1,
    vertical: "hr",
    desc: "Separation terms dashboard with non-compete tracking, severance payment status, and sign-off",
    regions: ["US", "UK", "EU", "Global"],
    schema: {
      employee: "string",
      employer: "string",
      separation_date: "date",
      severance_amount: "number",
      non_compete_months: "number?",
      release_scope: "string",
      consideration_period_days: "number",
    },
  },
  {
    name: "Resumes / CVs",
    endpoint: "/v1/resume",
    tier: 1,
    vertical: "hr",
    desc: "Candidate profile with skill matching, experience summary, and hiring endpoint status",
    regions: ["Global"],
    schema: {
      name: "string",
      email: "string",
      phone: "string?",
      experience: "[{company, title, start, end}]",
      education: "[{school, degree, year}]",
      skills: "[string]",
    },
  },
];

const realestate: readonly Endpoint[] = [
  {
    name: "Title Reports",
    endpoint: "/v1/title-report",
    tier: 1,
    vertical: "realestate",
    desc: "Title status with defect highlights, lien tracker, and insurance coverage verification",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      property_address: "string",
      owner: "string",
      legal_description: "string",
      liens: "[{type, holder, amount}]",
      easements: "[string]",
      exceptions: "[string]",
      effective_date: "date",
    },
  },
  {
    name: "Appraisals",
    endpoint: "/v1/appraisal",
    tier: 1,
    vertical: "realestate",
    desc: "Property valuation with comparable analysis, condition assessment, and underwriting routing",
    regions: ["US", "UK", "CA", "AU", "+8"],
    schema: {
      property_address: "string",
      appraised_value: "number",
      approach: "string",
      comparables: "[{address, sale_price, adjustments}]",
      condition: "string",
      appraiser: "string",
      date: "date",
    },
  },
  {
    name: "Environmental Assessments",
    endpoint: "/v1/environmental",
    tier: 1,
    vertical: "realestate",
    desc: "Phase assessment with liability findings, remediation recommendations, and insurance buttons",
    regions: ["US", "UK", "EU", "CA"],
    schema: {
      property_address: "string",
      phase: "string",
      findings: "[{condition, severity, description}]",
      recs: "[{condition, severity}]",
      consultant: "string",
      date: "date",
      clean: "boolean",
    },
  },
  {
    name: "Lease Abstracts",
    endpoint: "/v1/lease-abstract",
    tier: 1,
    vertical: "realestate",
    desc: "Lease timeline with expiration alerts, renewal option tracking, and rent escalation calculator",
    regions: ["US", "UK", "EU", "AU", "+12"],
    schema: {
      tenant: "string",
      landlord: "string",
      premises: "string",
      commencement: "date",
      expiry: "date",
      base_rent: "number",
      escalation: "string",
      renewal_options: "[{term, notice_period}]",
    },
  },
  {
    name: "Closing Disclosures",
    endpoint: "/v1/closing-disclosure",
    tier: 1,
    vertical: "realestate",
    desc: "Closing costs view with TRID compliance check, fee comparison, and settlement team routing",
    regions: ["US"],
    schema: {
      borrower: "string",
      property: "string",
      loan_amount: "number",
      interest_rate: "number",
      monthly_payment: "number",
      closing_costs: "number",
      cash_to_close: "number",
      closing_date: "date",
    },
  },
  {
    name: "Zoning Documents",
    endpoint: "/v1/zoning",
    tier: 1,
    vertical: "realestate",
    desc: "Zoning summary with use restrictions, setback requirements, and variance application buttons",
    regions: ["US", "UK", "CA"],
    schema: {
      property_address: "string",
      zone_class: "string",
      permitted_uses: "[string]",
      setbacks: "{front, side, rear}",
      far: "number",
      max_height: "string",
      variances: "[string]?",
    },
  },
];

const energy: readonly Endpoint[] = [
  {
    name: "Environmental Impact Statements",
    endpoint: "/v1/eis",
    tier: 1,
    vertical: "energy",
    desc: "Impact assessment with alternatives comparison, mitigation tracking, and public comment dashboard",
    regions: ["US", "UK", "EU", "CA", "AU", "+14"],
    schema: {
      project: "string",
      lead_agency: "string",
      alternatives: "[{name, description}]",
      impacts: "[{resource, severity, mitigation}]",
      public_comments: "number",
      record_of_decision: "string?",
    },
  },
  {
    name: "Pipeline Permits",
    endpoint: "/v1/pipeline-permit",
    tier: 1,
    vertical: "energy",
    desc: "Permit status with compliance conditions, route visualization, and segment monitoring tools",
    regions: ["US", "UK", "CA", "AU"],
    schema: {
      permit_number: "string",
      operator: "string",
      route: "string",
      capacity: "string",
      material: "string",
      length_miles: "number",
      conditions: "[string]",
      expiry_date: "date",
    },
  },
  {
    name: "NERC Compliance",
    endpoint: "/v1/nerc",
    tier: 1,
    vertical: "energy",
    desc: "Violation dashboard organized by severity, remediation plan tracking, and completion status",
    regions: ["US", "CA"],
    schema: {
      entity: "string",
      standard: "string",
      finding: "string",
      severity: "string",
      violation_date: "date",
      mitigation_plan: "string",
      completion_date: "date?",
    },
  },
  {
    name: "Interconnection Agreements",
    endpoint: "/v1/interconnection",
    tier: 1,
    vertical: "energy",
    desc: "Generator connection agreement with network upgrade checklist and commercial operation date tracker",
    regions: ["US", "UK", "EU", "AU"],
    schema: {
      generator: "string",
      utility: "string",
      capacity_mw: "number",
      poi: "string",
      voltage: "string",
      commercial_operation_date: "date",
      term_years: "number",
      network_upgrades: "[string]",
    },
  },
  {
    name: "Well Logs",
    endpoint: "/v1/well-log",
    tier: 1,
    vertical: "energy",
    desc: "Well section with formation breakdown, depth tracking, and development planning actions",
    regions: ["US", "CA", "UK", "AU", "+12"],
    schema: {
      well_name: "string",
      api_number: "string",
      operator: "string",
      spud_date: "date",
      total_depth: "number",
      formations: "[{name, top, bottom, lithology}]",
      status: "string",
    },
  },
  {
    name: "Decommissioning Reports",
    endpoint: "/v1/decommissioning",
    tier: 1,
    vertical: "energy",
    desc: "Decommission budget dashboard with remediation items, timeline, and regulatory approval flow",
    regions: ["US", "UK", "EU", "CA"],
    schema: {
      facility: "string",
      operator: "string",
      asset_count: "number",
      estimated_cost: "number",
      timeline: "{start, end}",
      remediation_items: "[{item, status}]",
      regulatory_approval: "string",
    },
  },
];

export const VERTICALS: readonly Vertical[] = [
  {
    key: "insurance",
    label: "Insurance",
    color: "var(--color-cat-insurance)",
    endpoints: insurance,
  },
  {
    key: "compliance",
    label: "Compliance",
    color: "var(--color-cat-compliance)",
    endpoints: compliance,
  },
  {
    key: "finance",
    label: "Finance",
    color: "var(--color-cat-finance)",
    endpoints: finance,
  },
  {
    key: "legal",
    label: "Legal",
    color: "var(--color-cat-legal)",
    endpoints: legal,
  },
  {
    key: "healthcare",
    label: "Healthcare",
    color: "var(--color-cat-healthcare)",
    endpoints: healthcare,
  },
  {
    key: "government",
    label: "Government",
    color: "var(--color-cat-government)",
    endpoints: government,
  },
  {
    key: "operations",
    label: "Supply Chain",
    color: "var(--color-cat-operations)",
    endpoints: operations,
  },
  { key: "hr", label: "HR", color: "var(--color-cat-hr)", endpoints: hr },
  {
    key: "realestate",
    label: "Real Estate",
    color: "var(--color-cat-realestate)",
    endpoints: realestate,
  },
  {
    key: "energy",
    label: "Energy & Infrastructure",
    color: "var(--color-cat-energy)",
    endpoints: energy,
  },
];

/** Flat list of every endpoint across all verticals. */
export const ALL_ENDPOINTS: readonly Endpoint[] = VERTICALS.flatMap(
  (v) => v.endpoints,
);

/** Index by path, e.g. ENDPOINTS_BY_PATH['/v1/coi']. */
export const ENDPOINTS_BY_PATH: Record<string, Endpoint> = Object.fromEntries(
  ALL_ENDPOINTS.map((e) => [e.endpoint, e]),
);

/** Lookup a vertical by its key. */
export const lookupVertical = (key: VerticalKey): Vertical | null =>
  VERTICALS.find((v) => v.key === key) ?? null;

/** Lookup an endpoint by its route path. */
export const lookupEndpoint = (path: string): Endpoint | null =>
  ENDPOINTS_BY_PATH[path] ?? null;

/** Tier-availability gate used by the docs / cards / picker. */
export function isEndpointAvailable(endpoint: Endpoint, tier: Tier): boolean {
  if (endpoint.tier === 0) return true;
  if (endpoint.tier === 1) return tier === "pro" || tier === "enterprise";
  return tier === "enterprise";
}
