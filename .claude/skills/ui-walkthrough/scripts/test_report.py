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

    def test_finding_kind_and_source_rules(self):
        unknown_kind = {"perf": [{"severity": "low", "kind": "hunch", "evidence": "x=1"}]}
        notes = report.validate(manifest(findings=unknown_kind))
        self.assertIn("unknown-finding-kind", codes(notes))
        self.assertEqual(report.errors(notes), [])

        bad_source = {"perf": [{"severity": "low", "evidence": "x=1", "source": ["harness"]}]}
        self.assertIn(
            "bad-finding-source", codes(report.validate(manifest(findings=bad_source)))
        )

        good = {
            "perf": [
                {
                    "severity": "low",
                    "kind": "regression",
                    "source": "performance harness",
                    "evidence": "x=1",
                    "confidence": "written by the self-test",
                }
            ]
        }
        self.assertEqual(report.errors(report.validate(manifest(findings=good))), [])

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


class CoverageScopeTests(unittest.TestCase):
    """`coverage.expected` is the change's scope, not the whole platform matrix."""

    def web_only(self, mode="partial"):
        return manifest(
            coverage={
                "mode": mode,
                "expected": ["desktop-web", "mobile-web"],
                "decisions": [
                    {
                        "platform": platform,
                        "status": "deferred",
                        "reason": "the shell reaches this code but has no runner here",
                    }
                    for platform in (
                        "windows-tauri",
                        "macos-tauri",
                        "linux-tauri",
                        "android-tauri",
                        "ios-tauri",
                    )
                ],
                "requirements": [
                    {
                        "platform": "desktop-web",
                        "id": "editor-opens",
                        "status": "evidence",
                        "satisfiedBy": {"view": "01_desktop"},
                    },
                    {
                        "platform": "desktop-web",
                        "id": "cycle-completes",
                        "status": "evidence",
                        "satisfiedBy": {"interaction": "desktop-cycle"},
                    },
                    {
                        "platform": "mobile-web",
                        "id": "editor-opens",
                        "status": "evidence",
                        "satisfiedBy": {"view": "02_mobile"},
                    },
                    {
                        "platform": "mobile-web",
                        "id": "cycle-completes",
                        "status": "evidence",
                        "satisfiedBy": {"interaction": "mobile-cycle"},
                    },
                ],
            },
            views=[
                {
                    "id": "01_desktop",
                    "title": "Desktop",
                    "platform": "desktop-web",
                    "light": "a_light.png",
                    "dark": "a_dark.png",
                },
                {
                    "id": "02_mobile",
                    "title": "Mobile",
                    "platform": "mobile-web",
                    "light": "b_light.png",
                    "dark": "b_dark.png",
                },
            ],
            performance={
                "interactions": [
                    {
                        "id": "desktop-cycle",
                        "name": "Cycle",
                        "platform": "desktop-web",
                        "window": "1600x900",
                        "provenance": {"build": "vite dev"},
                        "metrics": {"jsHeapMB": 12.5, "states": {"jsHeapMB": "measured"}},
                    },
                    {
                        "id": "mobile-cycle",
                        "name": "Cycle",
                        "platform": "mobile-web",
                        "window": "390x844",
                        "provenance": {"build": "vite dev"},
                        "metrics": {"jsHeapMB": 12.5, "states": {"jsHeapMB": "measured"}},
                    },
                ]
            },
            lighthouse={
                "runs": [
                    {
                        "route": "/editor",
                        "formFactor": "desktop",
                        "mode": "unspecified build",
                        "platform": "desktop-web",
                        "environment": {"lighthouse": "12.8.2"},
                        "preview": "desktop-preview.jpg",
                    },
                    {
                        "route": "/editor",
                        "formFactor": "mobile",
                        "mode": "unspecified build",
                        "platform": "mobile-web",
                        "environment": {"lighthouse": "12.8.2"},
                        "preview": "mobile-preview.jpg",
                    },
                ]
            },
        )

    def test_platforms_outside_the_scope_are_named_not_counted(self):
        summary = report.coverage_summary(self.web_only())
        self.assertEqual(summary["gaps"], [])
        self.assertEqual(
            summary["notInScope"],
            ["windows-tauri", "macos-tauri", "linux-tauri", "android-tauri", "ios-tauri"],
        )

    def test_a_web_only_change_can_be_complete(self):
        summary = report.coverage_summary(self.web_only(mode="full"))
        self.assertEqual(summary["status"], "complete")
        self.assertEqual(report.errors(report.validate(self.web_only(mode="full"))), [])

    def test_a_report_with_nothing_in_scope_is_never_complete(self):
        data = manifest(coverage={"mode": "full"}, views=[])
        summary = report.coverage_summary(data)
        self.assertEqual(summary["notInScope"], [])
        self.assertEqual(summary["status"], "incomplete")
        self.assertIn("coverage-expected-missing", codes(report.validate(data)))

    def test_the_scope_is_baked_into_the_built_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            pngs(tmp)
            out = Path(tmp) / "walkthrough.html"
            report.build(TEMPLATE, self.web_only(), out, base=Path(tmp), quality=80)
            html = out.read_text(encoding="utf-8")
        self.assertIn('"notInScope":["windows-tauri","macos-tauri","linux-tauri","android-tauri","ios-tauri"]', html)
        self.assertIn("outOfScope", html)


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


SHELLS = ("windows-tauri", "macos-tauri", "linux-tauri", "android-tauri", "ios-tauri")


def scoped(**overrides):
    """A two-platform change whose scope, decisions, requirements and evidence hold
    together; override one key to break exactly one rule."""
    data = manifest(
        coverage={
            "mode": "partial",
            "expected": ["desktop-web", "mobile-web"],
            "captured": ["desktop-web", "mobile-web"],
            "decisions": [
                {
                    "platform": platform,
                    "status": "deferred",
                    "reason": "the changed module is reachable here, but no runner is installed",
                }
                for platform in SHELLS
            ],
            "requirements": [
                {
                    "platform": "desktop-web",
                    "id": "editor-opens",
                    "status": "evidence",
                    "satisfiedBy": {"view": "01_desktop"},
                },
                {
                    "platform": "desktop-web",
                    "id": "cycle-completes",
                    "status": "evidence",
                    "satisfiedBy": {"interaction": "desktop-cycle"},
                },
                {
                    "platform": "mobile-web",
                    "id": "editor-opens",
                    "status": "evidence",
                    "satisfiedBy": {"view": "02_mobile"},
                },
            ],
        },
        views=[
            {
                "id": "01_desktop",
                "title": "Editor",
                "platform": "desktop-web",
                "light": "a_light.png",
                "dark": "a_dark.png",
            },
            {
                "id": "02_mobile",
                "title": "Editor, mobile",
                "platform": "mobile-web",
                "light": "b_light.png",
                "dark": "b_dark.png",
            },
        ],
        performance={
            "interactions": [
                {
                    "id": "desktop-cycle",
                    "name": "text editor cycle",
                    "platform": "desktop-web",
                    "window": "1600x900",
                    "provenance": {"build": "vite dev"},
                    "metrics": {"jsHeapMB": 12.5, "states": {"jsHeapMB": "measured"}},
                }
            ]
        },
        lighthouse={
            "runs": [
                {
                    "route": "/editor",
                    "formFactor": "desktop",
                    "mode": "vite dev",
                    "platform": "desktop-web",
                    "environment": {"lighthouse": "12.8.2"},
                    "preview": "desktop-preview.jpg",
                }
            ]
        },
    )
    data.update(overrides)
    return data


class CoverageDecisionTests(unittest.TestCase):
    """Scope exclusions must be reviewable, and evidence must be earned."""

    def test_a_shell_outside_the_scope_must_carry_a_reason(self):
        coverage = dict(scoped()["coverage"])
        coverage.pop("decisions")
        summary = report.coverage_summary(scoped(coverage=coverage))
        self.assertEqual(list(SHELLS), summary["undecided"])
        self.assertIn("coverage-decision-missing", codes(report.validate(scoped(coverage=coverage))))
        self.assertNotEqual("complete", summary["status"])

    def test_a_recorded_decision_replaces_the_warning_and_keeps_the_shell_named(self):
        summary = report.coverage_summary(scoped())
        self.assertEqual([], summary["undecided"])
        self.assertEqual(list(SHELLS), summary["notInScope"])
        self.assertEqual([], summary["gaps"])
        self.assertNotIn("coverage-decision-missing", codes(report.validate(scoped())))

    def test_an_unknown_platform_cannot_be_excluded_silently(self):
        coverage = dict(scoped()["coverage"])
        coverage["decisions"] = coverage["decisions"] + [
            {"platform": "solaris-web", "status": "not-applicable", "reason": "nobody runs it"}
        ]
        notes = codes(report.validate(scoped(coverage=coverage)))
        self.assertIn("coverage-decision-unknown-platform", notes)

    def test_expected_must_name_known_platforms_once(self):
        coverage = {
            "mode": "partial",
            "expected": ["desktop-web", "desktop-web", "amiga-web"],
            "captured": ["desktop-web"],
        }
        notes = codes(report.validate(scoped(coverage=coverage)))
        self.assertIn("coverage-expected-duplicate", notes)
        self.assertIn("coverage-expected-unknown-platform", notes)

    def test_a_required_platform_cannot_be_declared_not_applicable(self):
        coverage = dict(scoped()["coverage"])
        coverage["decisions"] = coverage["decisions"] + [
            {"platform": "desktop-web", "status": "not-applicable", "reason": "no runner"}
        ]
        notes = codes(report.validate(scoped(coverage=coverage)))
        self.assertIn("coverage-decision-conflict", notes)

    def test_a_decision_without_a_reason_is_an_error(self):
        coverage = dict(scoped()["coverage"])
        coverage["decisions"] = [
            {"platform": platform, "status": "unknown"} for platform in SHELLS
        ]
        notes = codes(report.validate(scoped(coverage=coverage)))
        self.assertIn("coverage-decision-without-reason", notes)

    def test_a_declared_capture_without_a_usable_asset_does_not_satisfy_coverage(self):
        view = {
            "id": "01_desktop",
            "title": "Editor",
            "platform": "desktop-web",
            "light": "",
            "dark": "",
        }
        manifest_ = scoped(views=[view])
        summary = report.coverage_summary(manifest_)
        self.assertNotIn("desktop-web", summary["verified"])
        self.assertIn("coverage-without-proof", codes(report.validate(manifest_)))

    def test_an_unrelated_interaction_does_not_satisfy_a_requirement(self):
        coverage = dict(scoped()["coverage"])
        coverage["requirements"] = [
            dict(requirement, satisfiedBy={"interaction": "some-other-cycle"})
            if requirement["id"] == "cycle-completes"
            else requirement
            for requirement in coverage["requirements"]
        ]
        manifest_ = scoped(coverage=coverage)
        summary = report.coverage_summary(manifest_)
        self.assertIn("desktop-web:cycle-completes", summary["unsatisfied"])
        self.assertIn("requirement-unsatisfied", codes(report.validate(manifest_)))

    def test_a_run_with_no_measured_metric_does_not_satisfy_performance_coverage(self):
        interaction = {
            "id": "desktop-cycle",
            "name": "text editor cycle",
            "platform": "desktop-web",
            "window": "1600x900",
            "provenance": {"build": "vite dev"},
            "metrics": {
                "jsHeapMB": None,
                "unavailable": ["process memory"],
                "states": {"jsHeapMB": "unsupported"},
            },
        }
        manifest_ = scoped(performance={"interactions": [interaction]})
        summary = report.coverage_summary(manifest_)
        self.assertNotIn("desktop-web", summary["performance"])
        notes = codes(report.validate(manifest_))
        self.assertIn("perf-run-without-measurement", notes)
        self.assertIn("requirement-unsatisfied", notes)

    def test_waived_coverage_stays_visible(self):
        coverage = dict(scoped()["coverage"])
        coverage["requirements"] = coverage["requirements"] + [
            {
                "platform": "desktop-web",
                "id": "cancellation",
                "status": "waived",
                "reason": "the scenario does not exercise cancel yet",
            }
        ]
        manifest_ = scoped(coverage=coverage)
        evidence = report.evaluate(manifest_)["evidence"]
        self.assertIn("desktop-web:cancellation", evidence["waived"])
        self.assertIn("requirement-unsatisfied", codes(report.validate(manifest_)))

    def test_a_blocked_requirement_without_a_reason_is_an_error(self):
        coverage = dict(scoped()["coverage"])
        coverage["requirements"] = coverage["requirements"] + [
            {"platform": "desktop-web", "id": "print-export", "status": "blocked"}
        ]
        notes = codes(report.validate(scoped(coverage=coverage)))
        self.assertIn("requirement-without-reason", notes)

    def test_metric_states_must_match_the_metrics_they_describe(self):
        interaction = dict(scoped()["performance"]["interactions"][0])
        interaction["metrics"] = {"jsHeapMB": 1.0, "states": {"jsHeapMB": "probably"}}
        notes = codes(report.validate(scoped(performance={"interactions": [interaction]})))
        self.assertIn("bad-metric-state", notes)

        # A 'measured' state with nothing recorded is a measurement that does
        # not exist; a non-measured state with a real number contradicts itself.
        interaction["metrics"] = {"jsHeapMB": 1.0, "states": {"ghost": "measured"}}
        notes = codes(report.validate(scoped(performance={"interactions": [interaction]})))
        self.assertIn("metric-state-without-value", notes)

        interaction["metrics"] = {"jsHeapMB": 1.0, "states": {"jsHeapMB": "blocked"}}
        notes = codes(report.validate(scoped(performance={"interactions": [interaction]})))
        self.assertIn("metric-state-contradiction", notes)

        # Naming a metric that was never recorded is the whole point of
        # 'blocked' and 'not-collected', so it stays legal.
        interaction["metrics"] = {"states": {"renderer.poolBytes": "blocked"}}
        notes = codes(report.validate(scoped(performance={"interactions": [interaction]})))
        self.assertNotIn("metric-state-without-value", notes)
        self.assertNotIn("bad-metric-state", notes)

    def test_claims_need_text_evidence_and_a_known_status(self):
        notes = codes(
            report.validate(
                scoped(
                    claims=[
                        {"claim": "", "status": "vibes", "evidence": []},
                        {
                            "claim": "retained storage stops growing",
                            "status": "not-measured",
                            "evidence": ["metrics.jsHeapMB"],
                        },
                    ]
                )
            )
        )
        self.assertIn("claim-without-text", notes)
        self.assertIn("bad-claim-status", notes)
        self.assertIn("claim-without-evidence", notes)
        self.assertIn("claim-unproven", notes)

    def test_claims_must_be_a_list(self):
        notes = codes(report.validate(scoped(claims={"claim": "x"})))
        self.assertIn("claims-not-a-list", notes)

    def test_stale_derived_data_is_reported(self):
        notes = codes(report.validate(scoped(coverageSummary={}, evaluation={})))
        self.assertIn("stale-derived-coverage", notes)

    def test_a_report_without_a_review_pass_says_so(self):
        manifest_ = scoped(review={"performed": False})
        self.assertFalse(report.evaluate(manifest_)["findings"]["recorded"])

        finding = {"title": "A thing", "severity": "low", "detail": "Seen once.", "view": "01_desktop"}
        manifest_ = scoped(review={"performed": False}, findings={"visual": [finding]})
        self.assertIn("findings-without-review", codes(report.validate(manifest_)))

    def test_evaluate_separates_validity_from_completeness_and_findings(self):
        verdict = report.evaluate(scoped())
        self.assertTrue(verdict["artifact"]["valid"])
        self.assertEqual("partial", verdict["evidence"]["status"])
        self.assertEqual(0, verdict["findings"]["total"])

        broken = scoped(views=[{"id": "", "title": "", "platform": "desktop-web"}])
        verdict = report.evaluate(broken)
        self.assertFalse(verdict["artifact"]["valid"])
        self.assertIn("coverage", verdict)

    def test_an_incomplete_report_is_still_publishable(self):
        manifest_ = scoped()
        self.assertEqual([], report.errors(report.validate(manifest_)))
        self.assertNotEqual("complete", report.coverage_summary(manifest_)["status"])


if __name__ == "__main__":
    unittest.main()
