#!/usr/bin/env python3
"""Self-tests for the report builder, validator and report self-checks.

Run: python3 -m unittest discover -s scripts/tests -t scripts
"""

from __future__ import annotations

import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import report  # noqa: E402

SKILL = Path(__file__).resolve().parents[2]
TEMPLATE = SKILL / "report-template.html"

# 1x1 transparent PNG: exercises the inline path without needing a codec.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def manifest(**overrides):
    data = {
        "feature": "Demo tool",
        "branch": "demo",
        "generated": "2026-01-01T00:00:00Z",
        "coverage": {
            "expected": ["desktop web", "desktop Tauri"],
            "captured": ["desktop web", "desktop Tauri"],
        },
        "views": [
            {
                "id": "01_empty",
                "title": "Empty state",
                "platform": "desktop web",
                "light": "01_empty_light.png",
                "dark": "01_empty_dark.png",
                "viewport": "1600x900",
                "notes": [],
            }
        ],
        "findings": {"visual": [], "ux": []},
    }
    data.update(overrides)
    return data


def codes(issues):
    return [issue["code"] for issue in issues]


def with_pngs(tmp):
    """Write the 1x1 PNG under both theme names the sample manifest uses."""
    for name in ("01_empty_light.png", "01_empty_dark.png"):
        (Path(tmp) / name).write_bytes(PNG)


class ValidateTests(unittest.TestCase):
    def test_a_complete_manifest_has_no_errors(self):
        self.assertEqual(report.errors(report.validate(manifest())), [])

    def test_empty_report_warns(self):
        issues = report.validate(manifest(views=[]))
        self.assertIn("empty-report", codes(issues))
        self.assertEqual(report.errors(issues), [])

    def test_duplicate_view_ids_are_errors(self):
        view = manifest()["views"][0]
        issues = report.validate(manifest(views=[view, dict(view)]))
        self.assertIn("duplicate-view-id", codes(issues))

    def test_a_view_without_a_platform_warns(self):
        view = dict(manifest()["views"][0])
        view.pop("platform")
        issues = report.validate(manifest(views=[view]))
        self.assertIn("view-without-platform", codes(issues))

    def test_a_view_missing_one_theme_warns(self):
        view = dict(manifest()["views"][0])
        view.pop("dark")
        issues = report.validate(manifest(views=[view]))
        self.assertIn("missing-theme-variant", codes(issues))

    def test_an_unknown_finding_group_warns(self):
        issues = report.validate(manifest(findings={"vibes": []}))
        self.assertIn("unknown-finding-group", codes(issues))

    def test_a_bad_severity_is_an_error(self):
        findings = {
            "visual": [
                {"severity": "urgent", "view": "01_empty", "title": "x", "detail": "y"}
            ]
        }
        self.assertIn("bad-severity", codes(report.validate(manifest(findings=findings))))

    def test_a_finding_pointing_at_an_unknown_view_is_an_error(self):
        findings = {
            "visual": [
                {"severity": "high", "view": "99_nope", "title": "x", "detail": "y"}
            ]
        }
        issues = report.validate(manifest(findings=findings))
        self.assertIn("unknown-view-ref", codes(issues))

    def test_a_performance_finding_needs_evidence(self):
        findings = {
            "perf": [{"severity": "high", "view": "01_empty", "title": "x", "detail": "y"}]
        }
        issues = report.validate(manifest(findings=findings))
        self.assertIn("perf-finding-without-evidence", codes(issues))

    def test_a_finding_without_confidence_only_warns(self):
        findings = {
            "visual": [
                {"severity": "low", "view": "01_empty", "title": "x", "detail": "y"}
            ]
        }
        issues = report.validate(manifest(findings=findings))
        self.assertIn("finding-without-confidence", codes(issues))
        self.assertEqual(report.errors(issues), [])

    def test_a_performance_run_needs_its_identity_fields(self):
        performance = {"interactions": [{"id": "open", "name": "Open dialog"}]}
        issues = report.validate(manifest(performance=performance))
        self.assertIn("perf-run-missing-field", codes(issues))

    def test_a_performance_run_needs_provenance(self):
        performance = {
            "interactions": [
                {
                    "id": "open",
                    "name": "Open dialog",
                    "platform": "desktop web",
                    "window": "idle + open",
                    "metrics": {},
                }
            ]
        }
        issues = report.validate(manifest(performance=performance))
        self.assertIn("perf-run-without-provenance", codes(issues))

    def test_a_lighthouse_run_needs_environment_and_mode(self):
        lighthouse = {"runs": [{"formFactor": "mobile", "route": "/editor"}]}
        issues = report.validate(manifest(lighthouse=lighthouse))
        self.assertIn("lh-run-missing-field", codes(issues))
        self.assertIn("lh-run-without-environment", codes(issues))

    def test_a_coverage_gap_warns(self):
        coverage = {"expected": ["desktop web", "iOS Tauri"], "captured": ["desktop web"]}
        issues = report.validate(manifest(coverage=coverage))
        self.assertIn("coverage-gap", codes(issues))


class InjectTests(unittest.TestCase):
    def test_the_block_is_replaced_once(self):
        template = "<script>window.__WALKTHROUGH__ = /*__DATA__*/{}/*__END__*/;</script>"
        out = report.inject(template, {"views": []})
        self.assertIn('window.__WALKTHROUGH__ = {"views":[]};', out)
        self.assertNotIn("/*__DATA__*/", out)
        self.assertNotIn("/*__END__*/", out)

    def test_a_template_without_the_block_is_rejected(self):
        with self.assertRaises(ValueError):
            report.inject("<script>window.__WALKTHROUGH__ = {};</script>", {})

    def test_a_template_with_two_blocks_is_rejected(self):
        block = "/*__DATA__*/{}/*__END__*/"
        with self.assertRaises(ValueError):
            report.inject(f"<script>{block}{block}</script>", {})


class BuildTests(unittest.TestCase):
    def test_the_shipped_template_is_buildable_and_self_contained(self):
        with tempfile.TemporaryDirectory() as tmp:
            with_pngs(tmp)
            data = manifest()
            out = Path(tmp) / "walkthrough.html"
            validation, notes = report.build(
                TEMPLATE, data, out, base=Path(tmp), quality=80, thumb_width=64
            )
            self.assertEqual(report.errors(validation), [])
            self.assertEqual(report.errors(notes), [])

            html = out.read_text(encoding="utf-8")
            self.assertNotIn("01_empty_light.png", html)
            payload = json.loads(
                report.re.search(
                    r"window\.__WALKTHROUGH__\s*=\s*(\{.*?\});?\s*</script>", html, report.re.S
                ).group(1)
            )
            view = payload["views"][0]
            self.assertTrue(view["light"].startswith("data:"))
            self.assertTrue(view["thumbs"]["light"].startswith("data:"))

    def test_a_missing_image_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = manifest()
            _, notes = report.build(
                TEMPLATE, data, Path(tmp) / "out.html", quality=80, thumb_width=64
            )
            self.assertIn("missing-image", codes(notes))

    def test_the_shipped_template_declares_every_element_the_tests_look_for(self):
        html = TEMPLATE.read_text(encoding="utf-8")
        for element_id in report.TEMPLATE_IDS:
            self.assertIn(f'id="{element_id}"', html)
        self.assertEqual(len(report.DATA_RE.findall(html)), 1)


class SelfTestTests(unittest.TestCase):
    def good_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            with_pngs(tmp)
            out = Path(tmp) / "walkthrough.html"
            report.build(TEMPLATE, manifest(), out, base=Path(tmp), quality=80, thumb_width=64)
            return out.read_text(encoding="utf-8")

    def test_a_built_report_passes(self):
        issues = report.self_test(self.good_html())
        self.assertEqual(report.errors(issues), [])

    def test_an_unreplaced_marker_is_an_error(self):
        html = self.good_html() + "<script>/*__DATA__*/{}/*__END__*/</script>"
        self.assertIn("unreplaced-markers", codes(report.self_test(html)))

    def test_a_missing_element_is_an_error(self):
        html = self.good_html().replace('id="coverage"', 'id="gone"')
        self.assertIn("missing-element", codes(report.self_test(html)))

    def test_a_relative_asset_is_an_error_unless_allowed(self):
        html = self.good_html() + '<img src="screenshots/x.png">'
        self.assertIn("relative-asset", codes(report.self_test(html)))
        self.assertNotIn(
            "relative-asset", codes(report.self_test(html, allow_relative=True))
        )

    def test_an_external_asset_is_an_error_even_when_relative_is_allowed(self):
        html = self.good_html() + '<img src="https://example.com/x.png">'
        self.assertIn(
            "external-asset", codes(report.self_test(html, allow_relative=True))
        )

    def test_a_broken_script_is_an_error(self):
        html = self.good_html().replace(
            "</body>", "<script>function ( {</script></body>", 1
        )
        self.assertIn("script-syntax", codes(report.self_test(html)))

    def test_a_second_data_binding_is_an_error(self):
        html = self.good_html() + "<script>window.__WALKTHROUGH__ = {};</script>"
        self.assertIn("data-binding", codes(report.self_test(html)))


if __name__ == "__main__":
    unittest.main()
