from __future__ import annotations

from enum import StrEnum

from .base import ApiModel


class DocumentType(StrEnum):
    academic = "academic"
    agenda = "agenda"
    brochure = "brochure"
    business_card = "business_card"
    case_study = "case_study"
    checklist = "checklist"
    contract = "contract"
    creative = "creative"
    datasheet = "datasheet"
    document = "document"
    flyer = "flyer"
    invoice = "invoice"
    letter = "letter"
    manual = "manual"
    menu = "menu"
    minutes = "minutes"
    newsletter = "newsletter"
    one_pager = "one_pager"
    poster = "poster"
    presentation = "presentation"
    press_release = "press_release"
    proposal = "proposal"
    recipe = "recipe"
    report = "report"
    resume = "resume"
    timeline = "timeline"
    whitepaper = "whitepaper"


class Action(StrEnum):
    new = "new"
    edit = "edit"
    question = "question"


class BriefModel(ApiModel):
    pass


class IntentClassification(BriefModel):
    doc_type: DocumentType
    action: Action
    wants_pdf: bool
    has_enough_info: bool
    missing_fields: list[str]
    notes: str
