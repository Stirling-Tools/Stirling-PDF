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
        "coverage": {"mode": "partial", "expected": ["desktop-web"], "captured": ["desktop-web"]},
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
        coverage = {"mode": "partial", "expected": [], "captured": []}
        notes = report.validate(manifest(views=[], coverage=coverage))
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
        coverage = {"mode": "partial", "expected": ["desktop-web", "ios-tauri"],
                    "captured": ["desktop-web"]}
        self.assertIn("coverage-gap", codes(report.validate(manifest(coverage=coverage))))

    def test_a_full_run_requires_the_missing_platform(self):
        coverage = {"mode": "full", "expected": ["desktop-web", "ios-tauri"],
                    "captured": ["desktop-web"]}
        notes = report.validate(manifest(coverage=coverage))
        self.assertIn("coverage-gap", codes(notes))
        self.assertTrue(report.errors(notes))

    def test_a_declared_capture_without_a_view_is_an_error(self):
        coverage = {"mode": "partial", "expected": ["desktop-web", "ios-tauri"],
                    "captured": ["desktop-web", "ios-tauri"]}
        notes = report.validate(manifest(coverage=coverage))
        self.assertIn("coverage-without-proof", codes(notes))
        self.assertTrue(report.errors(notes))

    def test_a_missing_coverage_mode_is_an_error(self):
        coverage = {"expected": ["desktop-web"], "captured": ["desktop-web"]}
        notes = report.validate(manifest(coverage=coverage))
        self.assertIn("coverage-mode-missing", codes(notes))
        self.assertTrue(report.errors(notes))

    def test_a_desktop_only_manifest_is_never_complete(self):
        summary = report.coverage_summary(manifest())
        self.assertFalse(summary["complete"])
        self.assertEqual(summary["verified"], ["desktop-web"])

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

    def test_hostile_strings_cannot_close_the_data_element(self):
        hostile = '</script><script>alert("xss")</script><img src=x onerror=alert(1)>'
        template = "<script>window.__WALKTHROUGH__ = /*__DATA__*/{}/*__END__*/;</script>"
        out = report.inject(template, {"views": [], "note": hostile})
        payload = report.DATA_RE_READ.search(out).group(1)
        self.assertNotIn("</script", payload)
        self.assertIn("\\u003c/script\\u003e", payload)
        self.assertEqual(json.loads(payload)["note"], hostile)


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
            self.assertTrue(payload["views"][0]["thumb_light"].startswith("data:"))
            summary = payload["coverageSummary"]
            self.assertFalse(summary["complete"])
            self.assertEqual(summary["verified"], ["desktop-web"])

    def test_a_remote_manifest_image_is_refused(self):
        data = manifest()
        data["views"][0]["light"] = "https://example.com/capture.png"
        with tempfile.TemporaryDirectory() as tmp:
            pngs(tmp)
            _, notes = report.build(TEMPLATE, data, Path(tmp) / "out.html", base=Path(tmp))
            self.assertIn("remote-manifest-asset", codes(notes))
            self.assertTrue(report.errors(notes))

    def test_an_undecodable_embedded_image_is_an_error(self):
        data = manifest()
        view = data["views"][0]
        view["light"] = "data:image/png;base64,@@@@"
        view["dark"] = "data:image/bmp;base64,AAAA"
        notes = report.validate(data)
        self.assertIn("image-undecodable", codes(notes))
        self.assertIn("image-unsupported", codes(notes))
        self.assertTrue(report.errors(notes))

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

    def test_report_text_never_travels_through_inner_html(self):
        self.assertNotIn(".innerHTML", TEMPLATE.read_text(encoding="utf-8"))

    def test_script_bodies_survive_case_and_spaced_end_tags(self):
        html = "<SCRIPT>var a = 1;</SCRIPT><script>function ( {</script ><script></script>"
        bodies = report.script_bodies(html)
        self.assertEqual(len(bodies), 3)
        self.assertIn("var a = 1;", bodies[0])


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

    def test_first_publication_creates_the_reports_branch(self):
        import shutil
        import subprocess

        if shutil.which("git") is None:
            self.skipTest("git is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            pngs(tmp)
            out = Path(tmp) / "walkthrough.html"
            validation, notes = report.build(
                TEMPLATE, manifest(), out, base=Path(tmp), quality=80
            )
            self.assertEqual(report.errors(validation), [])
            self.assertEqual(report.errors(notes), [])
            remote = Path(tmp) / "remote.git"
            src = Path(tmp) / "src"
            subprocess.run(["git", "init", "--bare", str(remote)], check=True,
                           capture_output=True)
            subprocess.run(["git", "init", "-b", "main", str(src)], check=True,
                           capture_output=True)
            subprocess.run(["git", "-C", str(src), "config", "user.email", "t@t"],
                           check=True, capture_output=True)
            subprocess.run(["git", "-C", str(src), "config", "user.name", "t"],
                           check=True, capture_output=True)
            subprocess.run(["git", "-C", str(src), "commit", "--allow-empty", "-m", "init"],
                           check=True, capture_output=True)
            subprocess.run(["git", "-C", str(src), "remote", "add", "origin", str(remote)],
                           check=True, capture_output=True)
            subprocess.run(["git", "-C", str(src), "push", "origin", "main"],
                           check=True, capture_output=True)
            real = report.repo_from_remote
            report.repo_from_remote = lambda *args, **kwargs: "o/r"
            try:
                first = report.publish(out, "demo", remote="origin",
                                       branch="wt-reports-test", base="main", cwd=src)
                again = report.publish(out, "demo", remote="origin",
                                       branch="wt-reports-test", base="main", cwd=src)
            finally:
                report.repo_from_remote = real
            self.assertTrue(first["changed"])
            self.assertFalse(again["changed"])
            self.assertEqual(first["path"], again["path"])
            heads = subprocess.run(
                ["git", "--git-dir", str(remote), "show-ref", "--heads"],
                check=True, capture_output=True, text=True,
            ).stdout
            self.assertIn("refs/heads/wt-reports-test", heads)

    def test_an_invalid_report_is_never_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.html"
            bad.write_text("<html><body>no binding</body></html>", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                report.publish(bad, "demo", remote="origin", cwd=Path(tmp))


if __name__ == "__main__":
    unittest.main()
