"""DocParse: document understanding for ingestion pipelines.

This package holds the basic (text-layer) tier; the advanced tier (Docling
layout parsing) is delivered as an optional addon and probed at runtime.
"""

from __future__ import annotations

from stirling.docparse.capability import activate_site, probe_capabilities
from stirling.docparse.chunking import advanced_chunks, basic_chunks
from stirling.docparse.docxfill import fill_docx
from stirling.docparse.extractor import ExtractFieldsAgent
from stirling.docparse.splitter import SmartSplitAgent
from stirling.docparse.suggest_schema import SuggestSchemaAgent

__all__ = [
    "ExtractFieldsAgent",
    "SmartSplitAgent",
    "SuggestSchemaAgent",
    "activate_site",
    "advanced_chunks",
    "basic_chunks",
    "fill_docx",
    "probe_capabilities",
]
