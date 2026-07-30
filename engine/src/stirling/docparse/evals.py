"""Extraction accuracy harness: score a gold-labelled case set against a live engine.

Case layout (one directory per document):

    cases/
      invoice-001/
        input.pdf            # the document
        expected.json        # {"fieldsSchema": {...}, "fields": {"invoice_number": "INV-1", ...},
                             #  "pages": [{"pageNumber": 1, "text": "..."}]?  (optional, for basic tier)}

Run:
    uv run python -m stirling.docparse.evals cases/ --engine http://localhost:5001 --output report.json

Scoring per field: exact match, then normalized match (case/whitespace/currency
punctuation collapsed, numeric tolerance 1e-6). The report aggregates per-case
and overall accuracy so pipeline changes can be regression-tracked. Stdlib
HTTP only - the harness must run anywhere the engine runs.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_NORMALIZE_STRIP = re.compile(r"[\s,€$£%]+")


def normalized_equal(expected: Any, actual: Any) -> bool:
    if expected is None or actual is None:
        return expected is actual
    try:
        return abs(float(expected) - float(actual)) < 1e-6
    except (TypeError, ValueError):
        pass
    if isinstance(expected, list) and isinstance(actual, list):
        return len(expected) == len(actual) and all(normalized_equal(e, a) for e, a in zip(expected, actual))
    return _NORMALIZE_STRIP.sub("", str(expected)).casefold() == _NORMALIZE_STRIP.sub("", str(actual)).casefold()


def _call_extract(engine: str, secret: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{engine.rstrip('/')}/api/v1/docparse/extract",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **({"X-Engine-Auth": secret} if secret else {})},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        return json.loads(response.read().decode("utf-8"))


def score_case(engine: str, secret: str | None, case_dir: Path) -> dict[str, Any]:
    expected_spec = json.loads((case_dir / "expected.json").read_text(encoding="utf-8"))
    payload: dict[str, Any] = {
        "fileName": "input.pdf",
        "fieldsSchema": expected_spec["fieldsSchema"],
    }
    input_pdf = case_dir / "input.pdf"
    if input_pdf.exists():
        payload["contentBase64"] = base64.b64encode(input_pdf.read_bytes()).decode("ascii")
    if expected_spec.get("pages"):
        payload["pages"] = expected_spec["pages"]

    response = _call_extract(engine, secret, payload)
    actual = {field["name"]: field for field in response.get("fields", [])}

    fields: list[dict[str, Any]] = []
    exact = 0
    normalized = 0
    for name, expected_value in expected_spec.get("fields", {}).items():
        actual_field = actual.get(name, {})
        actual_value = actual_field.get("value")
        is_exact = expected_value == actual_value
        is_normalized = is_exact or normalized_equal(expected_value, actual_value)
        exact += is_exact
        normalized += is_normalized
        fields.append(
            {
                "name": name,
                "expected": expected_value,
                "actual": actual_value,
                "exact": is_exact,
                "normalized": is_normalized,
                "confidence": actual_field.get("confidence"),
                "cited": bool(actual_field.get("citations")),
            }
        )

    total = len(fields) or 1
    return {
        "case": case_dir.name,
        "mode": response.get("mode"),
        "fields": fields,
        "exactAccuracy": round(exact / total, 4),
        "normalizedAccuracy": round(normalized / total, 4),
    }


def run(cases_root: Path, engine: str, secret: str | None) -> dict[str, Any]:
    case_dirs = sorted(d for d in cases_root.iterdir() if d.is_dir() and (d / "expected.json").exists())
    results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for case_dir in case_dirs:
        try:
            results.append(score_case(engine, secret, case_dir))
        except (urllib.error.URLError, OSError, KeyError, ValueError) as error:
            failures.append({"case": case_dir.name, "error": str(error)})

    scored = [r for r in results if r["fields"]]
    overall = {
        "cases": len(case_dirs),
        "scored": len(scored),
        "errors": failures,
        "exactAccuracy": round(sum(r["exactAccuracy"] for r in scored) / len(scored), 4) if scored else 0.0,
        "normalizedAccuracy": round(sum(r["normalizedAccuracy"] for r in scored) / len(scored), 4) if scored else 0.0,
        "results": results,
    }
    return overall


def main() -> int:
    parser = argparse.ArgumentParser(description="Score docparse extraction against a gold case set.")
    parser.add_argument("cases", help="Directory of case subdirectories")
    parser.add_argument("--engine", default="http://localhost:5001", help="Engine base URL")
    parser.add_argument("--secret", default=None, help="X-Engine-Auth shared secret, if the engine requires it")
    parser.add_argument("--output", default=None, help="Write the JSON report here (default: stdout)")
    args = parser.parse_args()

    report = run(Path(args.cases), args.engine, args.secret)
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
        print(f"exact={report['exactAccuracy']} normalized={report['normalizedAccuracy']} -> {args.output}")
    else:
        print(rendered)
    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())
