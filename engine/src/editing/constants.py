from models import PdfPreflight
from models.tool_models import OperationId

REQUIRED_CLARIFICATIONS = {
    "removePassword": ["password"],
    "deletePages": ["pageNumbers"],
}

DESTRUCTIVE_OPERATIONS = {
    "removePassword": "This will remove all security from your PDF.",
    "sanitize": "This will remove all metadata and hidden content.",
    "flatten": "This will convert all form fields to static content (irreversible).",
    "deletePages": "This will permanently delete the specified pages.",
}

DEFAULT_OPERATION_OVERRIDES = {
    "addPageNumbers": {
        "fontType": "times",
        "position": 8,
        "pageNumbers": "all",
        "pagesToNumber": "all",
        "customMargin": "medium",
        "customText": "{n}",
    },
    "processPdfWithOCR": {
        "languages": ["eng"],
        "ocrType": "skip-text",
        "ocrRenderType": "hocr",
    },
    "optimizePdf": {
        "optimizeLevel": 6,
        "grayscale": False,
        "linearize": False,
        "normalize": False,
    },
    "removeBlankPages": {
        "threshold": 10,
        "whitePercent": 95,
    },
}


# Risk policy table: Single source of truth for operation risk assessment
OPERATION_RISK_POLICY = [
    # High risk - destructive content removal (always confirm)
    {
        "op": "deletePages",
        "risk": "high",
        "always_confirm": True,
        "reason": "destructive content removal",
        "warning": "This will permanently delete the specified pages.",
    },
    {
        "op": "removePassword",
        "risk": "high",
        "always_confirm": True,
        "reason": "removes all security",
        "warning": "This will remove all security from your PDF.",
    },
    {
        "op": "sanitize",
        "risk": "high",
        "always_confirm": True,
        "reason": "removes metadata and hidden content",
        "warning": "This will remove all metadata and hidden content.",
    },
    {
        "op": "flatten",
        "risk": "high",
        "always_confirm": True,
        "reason": "irreversible form field conversion",
        "warning": "This will convert all form fields to static content (irreversible).",
    },
    # Medium risk - lossy transformations
    {
        "op": "optimizePdf",
        "risk": "medium",
        "always_confirm": False,
        "reason": "lossy compression",
        "confirm_if": lambda preflight: (preflight.file_size_mb or 0) > 50,  # > 50MB
    },
    {
        "op": "processPdfWithOCR",
        "risk": "medium",
        "always_confirm": False,
        "reason": "may alter text layer",
    },
    {
        "op": "extractImages",
        "risk": "medium",
        "always_confirm": False,
        "reason": "creates derivative content",
    },
    # Low risk - non-destructive transformations
    {
        "op": "rotatePDF",
        "risk": "low",
        "always_confirm": False,
    },
    {
        "op": "splitPdf",
        "risk": "low",
        "always_confirm": False,
    },
    {
        "op": "mergePdfs",
        "risk": "low",
        "always_confirm": False,
    },
    {
        "op": "addPageNumbers",
        "risk": "low",
        "always_confirm": False,
    },
    {
        "op": "addWatermark",
        "risk": "low",
        "always_confirm": False,
    },
]


def get_operation_risk(operation_id: OperationId, preflight: PdfPreflight | None = None) -> dict:
    """
    Get risk assessment for operation.

    Returns:
        {
            "level": "low" | "medium" | "high",
            "reason": "...",
            "should_confirm": bool,
            "warning": "..." (if high risk)
        }
    """
    preflight = preflight or PdfPreflight()

    for policy in OPERATION_RISK_POLICY:
        if policy["op"] == operation_id:
            should_confirm = policy.get("always_confirm", False)

            # Check conditional confirmation
            if not should_confirm and "confirm_if" in policy:
                confirm_fn = policy["confirm_if"]
                if callable(confirm_fn):
                    should_confirm = confirm_fn(preflight)

            return {
                "level": policy["risk"],
                "reason": policy.get("reason", ""),
                "should_confirm": should_confirm,
                "warning": policy.get("warning"),
            }

    # Default: assume low risk
    return {
        "level": "low",
        "reason": "",
        "should_confirm": False,
        "warning": None,
    }


def assess_plan_risk(operation_ids: list[OperationId], preflight: PdfPreflight | None = None) -> dict:
    """
    Assess combined risk for multiple operations.

    Args:
        operation_ids: List of operation IDs in plan
        preflight: File metadata

    Returns:
        {
            "level": "low" | "medium" | "high",
            "reasons": [list of risk reasons],
            "should_confirm": bool (if any op requires confirmation)
        }
    """
    risks = [get_operation_risk(op_id, preflight) for op_id in operation_ids]

    # Highest risk level wins
    if any(r["level"] == "high" for r in risks):
        level = "high"
    elif any(r["level"] == "medium" for r in risks):
        level = "medium"
    else:
        level = "low"

    # Multi-op with any high risk should confirm
    should_confirm = len(operation_ids) > 1 and level == "high"
    # Or any single op that always requires confirmation
    should_confirm = should_confirm or any(r["should_confirm"] for r in risks)

    reasons = [r["reason"] for r in risks if r["reason"]]

    return {
        "level": level,
        "reasons": reasons,
        "should_confirm": should_confirm,
    }
