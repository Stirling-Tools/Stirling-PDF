"""
Format-specific outline extraction prompts.

Each format has a dedicated prompt that instructs the AI to EXTRACT values
from the user's input rather than fabricate them.
"""

from .advisor_agreement import ADVISOR_AGREEMENT_PROMPT, ADVISOR_AGREEMENT_SECTIONS
from .audit_report import AUDIT_REPORT_PROMPT, AUDIT_REPORT_SECTIONS
from .board_minutes import BOARD_MINUTES_PROMPT, BOARD_MINUTES_SECTIONS
from .budget_proposal import BUDGET_PROPOSAL_PROMPT, BUDGET_PROPOSAL_SECTIONS
from .case_study import CASE_STUDY_PROMPT, CASE_STUDY_SECTIONS
from .committee_agenda import COMMITTEE_AGENDA_PROMPT, COMMITTEE_AGENDA_SECTIONS
from .contract import CONTRACT_PROMPT, CONTRACT_SECTIONS
from .cover_letter import COVER_LETTER_PROMPT, COVER_LETTER_SECTIONS
from .employee_handbook import EMPLOYEE_HANDBOOK_PROMPT, EMPLOYEE_HANDBOOK_SECTIONS
from .executive_summary import EXECUTIVE_SUMMARY_PROMPT, EXECUTIVE_SUMMARY_SECTIONS
from .expense_report import EXPENSE_REPORT_PROMPT, EXPENSE_REPORT_SECTIONS
from .incident_report import INCIDENT_REPORT_PROMPT, INCIDENT_REPORT_SECTIONS
from .independent_contractor_agreement import (
    INDEPENDENT_CONTRACTOR_AGREEMENT_PROMPT,
    INDEPENDENT_CONTRACTOR_AGREEMENT_SECTIONS,
)
from .invoice import INVOICE_PROMPT, INVOICE_SECTIONS
from .job_description import JOB_DESCRIPTION_PROMPT, JOB_DESCRIPTION_SECTIONS
from .letter import LETTER_PROMPT, LETTER_SECTIONS
from .letter_of_intent import LETTER_OF_INTENT_PROMPT, LETTER_OF_INTENT_SECTIONS
from .master_services_agreement import MASTER_SERVICES_AGREEMENT_PROMPT, MASTER_SERVICES_AGREEMENT_SECTIONS
from .meeting_agenda import MEETING_AGENDA_PROMPT, MEETING_AGENDA_SECTIONS
from .meeting_minutes import MEETING_MINUTES_PROMPT, MEETING_MINUTES_SECTIONS
from .nda import NDA_PROMPT, NDA_SECTIONS
from .offer_letter import OFFER_LETTER_PROMPT, OFFER_LETTER_SECTIONS
from .official_memo import OFFICIAL_MEMO_PROMPT, OFFICIAL_MEMO_SECTIONS
from .one_pager import ONE_PAGER_PROMPT, ONE_PAGER_SECTIONS
from .pay_stub import PAY_STUB_PROMPT, PAY_STUB_SECTIONS
from .performance_review import PERFORMANCE_REVIEW_PROMPT, PERFORMANCE_REVIEW_SECTIONS
from .press_release import PRESS_RELEASE_PROMPT, PRESS_RELEASE_SECTIONS
from .price_sheet import PRICE_SHEET_PROMPT, PRICE_SHEET_SECTIONS
from .privacy_policy import PRIVACY_POLICY_PROMPT, PRIVACY_POLICY_SECTIONS
from .proposal import PROPOSAL_PROMPT, PROPOSAL_SECTIONS
from .public_notice import PUBLIC_NOTICE_PROMPT, PUBLIC_NOTICE_SECTIONS
from .purchase_order import PURCHASE_ORDER_PROMPT, PURCHASE_ORDER_SECTIONS
from .quote import QUOTE_PROMPT, QUOTE_SECTIONS
from .receipt import RECEIPT_PROMPT, RECEIPT_SECTIONS
from .report import REPORT_PROMPT, REPORT_SECTIONS
from .resume import RESUME_PROMPT, RESUME_SECTIONS
from .safe_agreement import SAFE_AGREEMENT_PROMPT, SAFE_AGREEMENT_SECTIONS
from .separation_notice import SEPARATION_NOTICE_PROMPT, SEPARATION_NOTICE_SECTIONS
from .service_agreement import SERVICE_AGREEMENT_PROMPT, SERVICE_AGREEMENT_SECTIONS
from .standard_operating_procedures import STANDARD_OPERATING_PROCEDURES_PROMPT, STANDARD_OPERATING_PROCEDURES_SECTIONS
from .statement_of_work import STATEMENT_OF_WORK_PROMPT, STATEMENT_OF_WORK_SECTIONS
from .terms_of_service import TERMS_OF_SERVICE_PROMPT, TERMS_OF_SERVICE_SECTIONS

# Fallback prompt for "other" or unknown document types
# This is GENERATIVE (not extraction-based) - allows AI to determine structure
OTHER_PROMPT = """You are an outline generator for document creation.

The user wants to create a document but hasn't specified a standard type. Your job is to:
1. Understand what they want to create
2. Generate a sensible outline with appropriate sections

Rules:
- Create 5-9 sections that make sense for their request
- Each section should have a title and brief description (6-12 words)
- Format: "Section Title: Brief description of what goes here"
- Be creative and tailor the outline to their specific needs
- If they ask for something unusual, do your best to structure it logically

Output format (one section per line):
Title: [document title/name]
Section 1: Description of section 1
Section 2: Description of section 2
...and so on

If the user asks to make up or fake data, you can generate appropriate placeholder content."""

OTHER_SECTIONS = [
    "Title",
    "Introduction",
    "Main Content",
    "Details",
    "Conclusion",
]

# Map document types to their prompts and default sections
FORMAT_PROMPTS = {
    # Popular / Legacy
    "invoice": (INVOICE_PROMPT, INVOICE_SECTIONS),
    "resume": (RESUME_PROMPT, RESUME_SECTIONS),
    "cover_letter": (COVER_LETTER_PROMPT, COVER_LETTER_SECTIONS),
    "contract": (CONTRACT_PROMPT, CONTRACT_SECTIONS),
    "nda": (NDA_PROMPT, NDA_SECTIONS),
    "meeting_agenda": (MEETING_AGENDA_PROMPT, MEETING_AGENDA_SECTIONS),
    "agenda": (MEETING_AGENDA_PROMPT, MEETING_AGENDA_SECTIONS),
    # Legal
    "terms_of_service": (TERMS_OF_SERVICE_PROMPT, TERMS_OF_SERVICE_SECTIONS),
    "privacy_policy": (PRIVACY_POLICY_PROMPT, PRIVACY_POLICY_SECTIONS),
    # Financial
    "quote": (QUOTE_PROMPT, QUOTE_SECTIONS),
    "estimate": (QUOTE_PROMPT, QUOTE_SECTIONS),
    "receipt": (RECEIPT_PROMPT, RECEIPT_SECTIONS),
    "expense_report": (EXPENSE_REPORT_PROMPT, EXPENSE_REPORT_SECTIONS),
    # Business
    "proposal": (PROPOSAL_PROMPT, PROPOSAL_SECTIONS),
    "report": (REPORT_PROMPT, REPORT_SECTIONS),
    "letter": (LETTER_PROMPT, LETTER_SECTIONS),
    "one_pager": (ONE_PAGER_PROMPT, ONE_PAGER_SECTIONS),
    "statement_of_work": (STATEMENT_OF_WORK_PROMPT, STATEMENT_OF_WORK_SECTIONS),
    "sow": (STATEMENT_OF_WORK_PROMPT, STATEMENT_OF_WORK_SECTIONS),
    "meeting_minutes": (MEETING_MINUTES_PROMPT, MEETING_MINUTES_SECTIONS),
    "minutes": (MEETING_MINUTES_PROMPT, MEETING_MINUTES_SECTIONS),
    "press_release": (PRESS_RELEASE_PROMPT, PRESS_RELEASE_SECTIONS),
    # Governance
    "official_memo": (OFFICIAL_MEMO_PROMPT, OFFICIAL_MEMO_SECTIONS),
    "board_minutes": (BOARD_MINUTES_PROMPT, BOARD_MINUTES_SECTIONS),
    "committee_agenda": (COMMITTEE_AGENDA_PROMPT, COMMITTEE_AGENDA_SECTIONS),
    "executive_summary": (EXECUTIVE_SUMMARY_PROMPT, EXECUTIVE_SUMMARY_SECTIONS),
    "incident_report": (INCIDENT_REPORT_PROMPT, INCIDENT_REPORT_SECTIONS),
    "public_notice": (PUBLIC_NOTICE_PROMPT, PUBLIC_NOTICE_SECTIONS),
    # Contracts
    "service_agreement": (SERVICE_AGREEMENT_PROMPT, SERVICE_AGREEMENT_SECTIONS),
    "independent_contractor_agreement": (
        INDEPENDENT_CONTRACTOR_AGREEMENT_PROMPT,
        INDEPENDENT_CONTRACTOR_AGREEMENT_SECTIONS,
    ),
    "safe_agreement": (SAFE_AGREEMENT_PROMPT, SAFE_AGREEMENT_SECTIONS),
    "advisor_agreement": (ADVISOR_AGREEMENT_PROMPT, ADVISOR_AGREEMENT_SECTIONS),
    "nondisclosure_agreement": (NDA_PROMPT, NDA_SECTIONS),
    "master_services_agreement": (MASTER_SERVICES_AGREEMENT_PROMPT, MASTER_SERVICES_AGREEMENT_SECTIONS),
    # Finance
    "purchase_order": (PURCHASE_ORDER_PROMPT, PURCHASE_ORDER_SECTIONS),
    "budget_proposal": (BUDGET_PROPOSAL_PROMPT, BUDGET_PROPOSAL_SECTIONS),
    "audit_report": (AUDIT_REPORT_PROMPT, AUDIT_REPORT_SECTIONS),
    # Sales
    "case_study": (CASE_STUDY_PROMPT, CASE_STUDY_SECTIONS),
    "letter_of_intent": (LETTER_OF_INTENT_PROMPT, LETTER_OF_INTENT_SECTIONS),
    "price_sheet": (PRICE_SHEET_PROMPT, PRICE_SHEET_SECTIONS),
    # Human Resources
    "job_description": (JOB_DESCRIPTION_PROMPT, JOB_DESCRIPTION_SECTIONS),
    "offer_letter": (OFFER_LETTER_PROMPT, OFFER_LETTER_SECTIONS),
    "pay_stub": (PAY_STUB_PROMPT, PAY_STUB_SECTIONS),
    "payslip": (PAY_STUB_PROMPT, PAY_STUB_SECTIONS),
    "separation_notice": (SEPARATION_NOTICE_PROMPT, SEPARATION_NOTICE_SECTIONS),
    "performance_review": (PERFORMANCE_REVIEW_PROMPT, PERFORMANCE_REVIEW_SECTIONS),
    "employee_handbook": (EMPLOYEE_HANDBOOK_PROMPT, EMPLOYEE_HANDBOOK_SECTIONS),
    "standard_operating_procedures": (STANDARD_OPERATING_PROCEDURES_PROMPT, STANDARD_OPERATING_PROCEDURES_SECTIONS),
}

# Categories for frontend tabs
CATEGORIES = {
    "popular": ["resume", "invoice", "cover_letter", "meeting_agenda", "contract", "nda"],
    "legal": ["contract", "nda", "terms_of_service", "privacy_policy"],
    "financial": ["invoice", "quote", "receipt", "expense_report"],
    "business": ["proposal", "report", "letter", "one_pager", "statement_of_work", "meeting_minutes", "press_release"],
}


def get_format_prompt(document_type: str) -> tuple[str | None, list[str] | None]:
    """
    Get the prompt and default sections for a document type.

    Returns:
        tuple: (prompt, sections) - both strings/lists, or (None, None) if not found

    For "other" or unknown types, returns the generative prompt
    which allows the AI to determine appropriate structure.
    """
    doc_type = document_type.lower().replace(" ", "_").replace("-", "_")

    # Check if we have a specific format prompt
    if doc_type in FORMAT_PROMPTS:
        return FORMAT_PROMPTS[doc_type]

    # For "other", "document", or unknown types, return the generative prompt
    if doc_type in ("other", "document", "miscellaneous", "unknown", ""):
        return (OTHER_PROMPT, OTHER_SECTIONS)

    # Unknown type - return None to use default behavior in ai_generation.py
    return (None, None)


def has_format_prompt(document_type: str) -> bool:
    """Check if a document type has a dedicated format prompt."""
    doc_type = document_type.lower().replace(" ", "_").replace("-", "_")
    return doc_type in FORMAT_PROMPTS


__all__ = [
    "FORMAT_PROMPTS",
    "CATEGORIES",
    "get_format_prompt",
    "has_format_prompt",
    "OTHER_PROMPT",
    "OTHER_SECTIONS",
]
