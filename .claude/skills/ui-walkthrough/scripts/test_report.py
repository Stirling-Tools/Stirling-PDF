#!/usr/bin/env python3
"""Self-tests for the report builder, validator and publisher.

Run: python3 scripts/test_report.py
"""

from __future__ import annotations

import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import report  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
TEMPLATE = HERE / "report-template.html"
URL = "https://raw.githubusercontent.com/o/r/main/reports/demo-walkthrough.html"
# 1x1 transparent PNG: exercises inlining without needing an encoder.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def manifest(**overrides):
    data = {
        "feature": "Demo tool",
        "branch": "demo",
        "generated": "2026-01-01",
        "coverage": {"expected": ["desktop-web"], "captured": ["desktop-web"]},
        "views": [
            {
                "id": "01_empty",
                "title": "Empty state",
                "platform": "desktop-web",
                "light": "01_empty_light.png",
                "dark": "01_empty_dark.png",
            }
        ],
        "findings": {"visual": [], "ux": []},
    }
    data.update(overrides)
    return data


def codes(notes):
    return [note["code"] for note in notes]


def pngs(tmp):
    for name in ("01_empty_light.png", "01_empty_dark.png"):
        (Path(tmp) / name).write_bytes(PNG)


class ValidateTests(unittest.TestCase):
    def test_a_complete_manifest_has_no_errors(self):
        self.assertEqual(report.errors(report.validate(manifest())), [])

    def test_an_empty_report_only_warns(self):
        notes = report.validate(manifest(views=[]))
        self.assertIn("empty-report", codes(notes))
        self.assertEqual(report.errors(notes), [])

    def test_duplicate_view_ids_are_errors(self):
        view = manifest()["views"][0]
        self.assertIn(
            "duplicate-view-id", codes(report.validate(manifest(views=[view, dict(view)])))
        )

    def test_a_view_without_a_platform_warns(self):
        view = dict(manifest()["views"][0])
        view.pop("platform")
        self.assertIn("view-without-platform", codes(report.validate(manifest(views=[view]))))

    def test_a_missing_theme_variant_warns(self):
        view = dict(manifest()["views"][0])
        view.pop("dark")
        self.assertIn("missing-theme-variant", codes(report.validate(manifest(views=[view]))))

    def test_a_coverage_gap_warns(self):
        coverage = {"expected": ["desktop-web", "ios-tauri"], "captured": ["desktop-web"]}
        self.assertIn("coverage-gap", codes(report.validate(manifest(coverage=coverage))))

    def test_finding_rules(self):
        bad_severity = {"visual": [{"severity": "urgent", "view": "01_empty"}]}
        self.assertIn("bad-severity", codes(report.validate(manifest(findings=bad_severity))))
        unknown_view = {"ux": [{"severity": "low", "view": "99_nope"}]}
        self.assertIn("unknown-view-ref", codes(report.validate(manifest(findings=unknown_view))))
        no_evidence = {"perf": [{"severity": "high", "view": "01_empty", "detail": "slow"}]}
        self.assertIn(
            "perf-finding-without-evidence", codes(report.validate(manifest(findings=no_evidence)))
        )

    def test_performance_runs_need_identity_and_provenance(self):
        performance = {"interactions": [{"id": "open"}]}
        notes = codes(report.validate(manifest(performance=performance)))
        self.assertIn("perf-run-missing-field", notes)
        self.assertIn("perf-run-without-provenance", notes)

    def test_lighthouse_runs_need_mode_and_environment(self):
        lighthouse = {"runs": [{"formFactor": "mobile", "route": "/editor"}]}
        notes = codes(report.validate(manifest(lighthouse=lighthouse)))
        self.assertIn("lh-run-missing-field", notes)
        self.assertIn("lh-run-without-environment", notes)


class InjectTests(unittest.TestCase):
    def test_the_data_block_is_replaced_with_marker_free_json(self):
        template = "<script>window.__WALKTHROUGH__ = /*__DATA__*/{}/*__END__*/;</script>"
        out = report.inject(template, {"views": []})
        self.assertIn('window.__WALKTHROUGH__ = {"views":[]};', out)
        self.assertNotIn("/*__DATA__*/", out)

    def test_the_template_must_hold_exactly_one_block(self):
        with self.assertRaises(ValueError):
            report.inject("<script>window.__WALKTHROUGH__ = {};</script>", {})
        block = "/*__DATA__*/{}/*__END__*/"
        with self.assertRaises(ValueError):
            report.inject(f"<script>{block}{block}</script>", {})


class BuildTests(unittest.TestCase):
    def test_the_shipped_template_builds_self_contained(self):
        with tempfile.TemporaryDirectory() as tmp:
            pngs(tmp)
            out = Path(tmp) / "walkthrough.html"
            validation, notes = report.build(
                TEMPLATE, manifest(), out, base=Path(tmp), quality=80
            )
            self.assertEqual(report.errors(validation), [])
            self.assertEqual(report.errors(notes), [])
            html = out.read_text(encoding="utf-8")
            self.assertNotIn('src="01_empty_light.png"', html)
            payload = json.loads(
                report.re.search(
                    r"window\.__WALKTHROUGH__\s*=\s*(\{.*?\});?\s*</script>", html, report.re.S
                ).group(1)
            )
            self.assertTrue(payload["views"][0]["light"].startswith("data:"))

    def test_a_missing_image_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, notes = report.build(TEMPLATE, manifest(), Path(tmp) / "out.html")
            self.assertIn("missing-image", codes(notes))

    def test_the_shipped_template_declares_the_ids_the_report_needs(self):
        html = TEMPLATE.read_text(encoding="utf-8")
        for element_id in report.TEMPLATE_IDS:
            self.assertIn(f'id="{element_id}"', html)
        self.assertEqual(len(report.DATA_RE.findall(html)), 1)


class SelfTestTests(unittest.TestCase):
    def built(self, tmp):
        pngs(tmp)
        out = Path(tmp) / "walkthrough.html"
        report.build(TEMPLATE, manifest(), out, base=Path(tmp), quality=80)
        return out.read_text(encoding="utf-8")

    def test_a_built_report_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(report.errors(report.self_test(self.built(tmp))), [])

    def test_a_leftover_marker_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            html = self.built(tmp) + "<script>/*__DATA__*/{}/*__END__*/</script>"
            self.assertIn("unreplaced-markers", codes(report.self_test(html)))

    def test_a_relative_or_external_asset_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            html = self.built(tmp)
            self.assertIn(
                "relative-asset", codes(report.self_test(html + '<img src="screenshots/x.png">'))
            )
            self.assertIn(
                "external-asset",
                codes(report.self_test(html + '<img src="https://example.com/x.png">')),
            )

    def test_a_second_binding_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            html = self.built(tmp) + "<script>window.__WALKTHROUGH__ = {};</script>"
            self.assertIn("data-binding", codes(report.self_test(html)))


class PublishTests(unittest.TestCase):
    def test_report_paths_are_content_addressed(self):
        self.assertEqual(
            report.content_addressed_path("demo", b"a", {}), "reports/demo-walkthrough.html"
        )
        existing = {"reports/demo-walkthrough.html": b"a"}
        self.assertEqual(
            report.content_addressed_path("demo", b"a", existing),
            "reports/demo-walkthrough.html",
        )
        self.assertRegex(
            report.content_addressed_path("demo", b"b", existing),
            r"^reports/demo-walkthrough-[0-9a-f]{7}\.html$",
        )

    def test_the_pr_block_is_upserted_in_place(self):
        once = report.upsert_block("## What\n\nstuff\n", URL)
        self.assertTrue(once.startswith("## What"))
        self.assertEqual(report.upsert_block(once, URL), once)
        again = report.upsert_block(once, URL.replace("/main/", "/release/"))
        self.assertEqual(again.count(report.BLOCK_START), 1)
        self.assertIn("/release/", again)

    def test_a_malformed_pr_block_is_refused(self):
        with self.assertRaises(RuntimeError):
            report.upsert_block(f"{report.BLOCK_START}\nno end\n", URL)


if __name__ == "__main__":
    unittest.main()
