#!/usr/bin/env python3
"""Self-tests for the publisher: content addressing, the managed PR block, and
the git/gh plumbing with the subprocess seam faked, so nothing leaves the box.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import publish  # noqa: E402

URL = "https://raw.githubusercontent.com/o/r/main/reports/demo-walkthrough.html"


class SlugTests(unittest.TestCase):
    def test_slugifies_a_feature_name(self):
        self.assertEqual(publish.slugify("Compress PDF tool"), "compress-pdf-tool")

    def test_falls_back_when_there_is_nothing_to_slugify(self):
        self.assertEqual(publish.slugify("***"), "walkthrough")


class ContentAddressTests(unittest.TestCase):
    def test_a_new_report_gets_the_stable_name(self):
        self.assertEqual(
            publish.content_addressed_path("demo", b"a", {}),
            "reports/demo-walkthrough.html",
        )

    def test_identical_bytes_reuse_the_published_path(self):
        existing = {"reports/demo-walkthrough.html": b"a"}
        self.assertEqual(
            publish.content_addressed_path("demo", b"a", existing),
            "reports/demo-walkthrough.html",
        )

    def test_changed_bytes_get_a_content_addressed_name(self):
        existing = {"reports/demo-walkthrough.html": b"a"}
        path = publish.content_addressed_path("demo", b"b", existing)
        self.assertRegex(path, r"^reports/demo-walkthrough-[0-9a-f]{7}\.html$")

    def test_a_content_addressed_collision_is_refused(self):
        existing = {"reports/demo-walkthrough.html": b"a"}
        path = publish.content_addressed_path("demo", b"b", existing)
        existing[path] = b"c"
        with self.assertRaises(publish.PublishError):
            publish.content_addressed_path("demo", b"b", existing)


class BlockTests(unittest.TestCase):
    def test_the_block_carries_both_urls(self):
        block = publish.block_for(URL)
        self.assertTrue(block.startswith(publish.BLOCK_START))
        self.assertTrue(block.endswith(publish.BLOCK_END))
        self.assertIn(f"https://htmlpreview.github.io/?{URL}", block)
        self.assertIn(f"- Download: {URL}", block)

    def test_an_empty_body_gets_the_block(self):
        self.assertIn(publish.BLOCK_START, publish.upsert_block("", URL))

    def test_an_existing_body_keeps_its_text(self):
        out = publish.upsert_block("## What\n\nstuff\n", URL)
        self.assertTrue(out.startswith("## What\n\nstuff\n"))
        self.assertIn(publish.BLOCK_START, out)

    def test_the_upsert_is_idempotent(self):
        once = publish.upsert_block("body\n", URL)
        self.assertEqual(publish.upsert_block(once, URL), once)

    def test_a_second_run_replaces_the_block_in_place(self):
        once = publish.upsert_block("body\n", URL)
        again = publish.upsert_block(once, URL.replace("/main/", "/release/"))
        self.assertEqual(again.count(publish.BLOCK_START), 1)
        self.assertIn("/release/", again)

    def test_unbalanced_markers_are_refused(self):
        with self.assertRaises(publish.PublishError):
            publish.upsert_block(f"{publish.BLOCK_START}\nno end\n", URL)

    def test_two_blocks_are_refused(self):
        block = publish.block_for(URL)
        with self.assertRaises(publish.PublishError):
            publish.upsert_block(block + block, URL)


class ConcurrentEditTests(unittest.TestCase):
    def test_detects_a_body_that_moved(self):
        self.assertTrue(publish.detect_concurrent_edit("a", "b"))

    def test_a_null_body_is_an_empty_body(self):
        self.assertFalse(publish.detect_concurrent_edit(None, ""))
        self.assertFalse(publish.detect_concurrent_edit("a", "a"))


class RemoteTests(unittest.TestCase):
    def test_reads_owner_and_repo_from_a_remote(self):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            subprocess.run(
                [
                    "git",
                    "remote",
                    "add",
                    "upstream",
                    "https://github.com/Stirling-Tools/Stirling-PDF.git",
                ],
                cwd=tmp,
                check=True,
            )
            self.assertEqual(
                publish.repo_from_remote("upstream", cwd=tmp),
                "Stirling-Tools/Stirling-PDF",
            )

    def test_raw_url_is_the_raw_host(self):
        self.assertEqual(
            publish.raw_url("o/r", "main", "reports/x.html"),
            "https://raw.githubusercontent.com/o/r/main/reports/x.html",
        )


def _body_file(cmd: list[str]) -> Path:
    """The temp file a `gh api -F body=@<file>` patch reads from."""
    for arg in cmd:
        if "body=@" in arg:
            return Path(arg.split("body=@", 1)[1])
    raise AssertionError(f"no body file in {cmd}")


class LinkTests(unittest.TestCase):
    def test_link_appends_the_block_and_verifies_the_round_trip(self):
        state = {"body": "## Original\n"}

        def fake(cmd, *, cwd=None):
            if "PATCH" in cmd:
                state["body"] = _body_file(cmd).read_text(encoding="utf-8")
                return ""
            return json.dumps({"body": state["body"]})

        with mock.patch.object(publish, "_run", fake):
            out = publish.link(7, URL, repo="o/r")
        self.assertTrue(out["changed"])
        self.assertEqual(state["body"].count(publish.BLOCK_START), 1)
        self.assertTrue(state["body"].startswith("## Original"))

    def test_link_is_a_no_op_when_the_block_is_current(self):
        state = {"body": publish.upsert_block("## Original\n", URL)}

        def fake(cmd, *, cwd=None):
            if "PATCH" in cmd:
                self.fail("an unchanged body must not be patched")
            return json.dumps({"body": state["body"]})

        with mock.patch.object(publish, "_run", fake):
            out = publish.link(7, URL, repo="o/r")
        self.assertFalse(out["changed"])

    def test_link_can_preview_without_writing(self):
        def fake(cmd, *, cwd=None):
            if "PATCH" in cmd:
                self.fail("dry-run must not patch")
            return json.dumps({"body": "## Original\n"})

        with mock.patch.object(publish, "_run", fake):
            out = publish.link(7, URL, repo="o/r", dry_run=True)
        self.assertTrue(out["dry_run"])

    def test_link_aborts_when_the_body_moves_underneath_it(self):
        state = {"reads": 0}

        def fake(cmd, *, cwd=None):
            if "PATCH" in cmd:
                return ""
            state["reads"] += 1
            if state["reads"] > 1:
                return json.dumps({"body": "someone else edited\n"})
            return json.dumps({"body": "## Original\n"})

        with mock.patch.object(publish, "_run", fake):
            with self.assertRaises(publish.PublishError):
                publish.link(7, URL, repo="o/r")


class PublishTests(unittest.TestCase):
    def _fake(self, calls, seen, branch_exists=True):
        def fake(cmd, *, cwd=None):
            calls.append(list(cmd))
            joined = " ".join(cmd)
            if joined.startswith("git worktree add"):
                Path(cmd[-2]).mkdir(parents=True, exist_ok=True)
                return ""
            if "rev-parse" in joined:
                if not branch_exists:
                    raise publish.PublishError("unknown revision")
                return "deadbeef"
            if "remote get-url" in joined:
                return "https://github.com/o/r.git"
            if len(cmd) >= 4 and cmd[1] == "-C" and cmd[3] == "add":
                seen["bytes"] = (Path(cmd[2]) / cmd[-1]).read_bytes()
                return ""
            return ""

        return fake

    def test_publishing_a_new_report_writes_commits_and_pushes_once(self):
        calls, seen = [], {}
        report_bytes = b"<!doctype html><title>demo</title>"
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "walkthrough.html"
            report.write_bytes(report_bytes)
            with mock.patch.object(publish, "_run", self._fake(calls, seen)):
                out = publish.publish(report, "Demo tool", cwd=tmp)
        self.assertTrue(out["changed"])
        self.assertEqual(out["path"], "reports/demo-tool-walkthrough.html")
        self.assertEqual(seen["bytes"], report_bytes)
        pushed = [c for c in calls if c[0] == "git" and "push" in c]
        self.assertEqual(len(pushed), 1)
        self.assertIn("refs/heads/ui-walkthrough-reports", " ".join(pushed[0]))

    def test_publishing_on_first_use_creates_the_reports_branch(self):
        calls, seen = [], {}
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "walkthrough.html"
            report.write_text("x", encoding="utf-8")
            with mock.patch.object(
                publish, "_run", self._fake(calls, seen, branch_exists=False)
            ):
                out = publish.publish(report, "Demo tool", cwd=tmp)
        self.assertTrue(out["changed"])
        branch_creates = [
            c for c in calls if c[:3] == ["git", "worktree", "add"] and "-b" in c
        ]
        self.assertEqual(len(branch_creates), 1)

    def test_a_dry_run_publishes_nothing(self):
        calls, seen = [], {}
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "walkthrough.html"
            report.write_text("x", encoding="utf-8")
            with mock.patch.object(publish, "_run", self._fake(calls, seen)):
                out = publish.publish(report, "Demo tool", cwd=tmp, dry_run=True)
        self.assertTrue(out["dry_run"])
        self.assertFalse(any(c[:2] == ["git", "push"] for c in calls))


if __name__ == "__main__":
    unittest.main()
