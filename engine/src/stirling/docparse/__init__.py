"""DocParse: document understanding for ingestion pipelines.

This package holds the basic (text-layer) tier; the advanced tier (Docling
layout parsing) is delivered as an optional addon and probed at runtime.
"""

from __future__ import annotations

from stirling.docparse.capability import activate_site, probe_capabilities
from stirling.docparse.chunking import basic_chunks

__all__ = [
    "activate_site",
    "basic_chunks",
    "probe_capabilities",
]
