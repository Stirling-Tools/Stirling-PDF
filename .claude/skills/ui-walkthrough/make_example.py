#!/usr/bin/env python3
"""Build EXAMPLE.html: a mock walkthrough that exercises every report feature.

The manifest below shows the shape the skill writes - the runtime/platform
matrix with a deliberate coverage gap, per-view provenance, bounded performance
evidence whose pictures are drawn from the recorded numbers, Lighthouse runs,
and findings in every group. It goes through scripts/report.py, so the example
is validated and self-tested exactly like a real report.

Run: python3 make_example.py
"""

from __future__ import annotations

import base64
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE / "scripts"))

import report  # noqa: E402  (sibling script, not an installed package)

LIGHT = dict(bg="#ffffff", fg="#111418", panel="#f1f3f6", accent="#2f6fed", muted="#c2c8d0")
DARK = dict(bg="#16181c", fg="#000000", panel="#1f232a", accent="#5b8cff", muted="#3a414b")

PLATFORMS = {
    "desktop-web": "desktop web / Chromium 140",
    "mobile-web": "mobile web / Chromium 140 device emulation",
    "windows-tauri": "Windows Tauri / WebView2",
    "macos-tauri": "macOS Tauri / WKWebView",
    "linux-tauri": "Linux Tauri / WebKitGTK",
    "android-tauri": "Android Tauri / physical device",
    "ios-tauri": "iOS Tauri / physical device",
}


def data_uri(svg: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def svg(bg, fg, panel, accent, muted, label, kind):
    """A 1600x900 mock screen, so the viewer can be demoed without a capture run."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">',
        f'<rect width="1600" height="900" fill="{bg}"/>',
        f'<rect width="1600" height="64" fill="{panel}"/>',
        f'<circle cx="40" cy="32" r="12" fill="{accent}"/>',
        f'<rect x="72" y="24" width="160" height="16" rx="8" fill="{muted}"/>',
        f'<rect x="1400" y="20" width="130" height="24" rx="6" fill="{accent}"/>',
        f'<rect x="0" y="64" width="220" height="836" fill="{panel}"/>',
    ]
    for index in range(6):
        parts.append(f'<rect x="24" y="{104 + index * 56}" width="172" height="32" rx="6" fill="{muted}"/>')
    if kind == "empty":
        parts += [
            f'<rect x="320" y="220" width="900" height="380" rx="12" fill="none" stroke="{muted}" stroke-width="3" stroke-dasharray="12 10"/>',
            f'<rect x="660" y="520" width="240" height="48" rx="8" fill="{accent}"/>',
        ]
    elif kind == "form":
        for index in range(4):
            parts += [
                f'<rect x="320" y="{180 + index * 120}" width="180" height="14" rx="7" fill="{muted}"/>',
                f'<rect x="320" y="{204 + index * 120}" width="900" height="44" rx="8" fill="{panel}"/>',
            ]
        parts.append(f'<rect x="320" y="690" width="220" height="48" rx="8" fill="{accent}"/>')
    else:
        parts += [
            f'<rect width="1600" height="900" fill="{fg}" opacity="0.45"/>',
            f'<rect x="520" y="270" width="560" height="360" rx="12" fill="{panel}"/>',
            f'<rect x="556" y="310" width="240" height="18" rx="9" fill="{muted}"/>',
            f'<rect x="556" y="356" width="460" height="12" rx="6" fill="{muted}"/>',
            f'<rect x="556" y="386" width="380" height="12" rx="6" fill="{muted}"/>',
            f'<rect x="692" y="548" width="150" height="44" rx="8" fill="{bg}"/>',
            f'<rect x="862" y="548" width="150" height="44" rx="8" fill="{accent}"/>',
        ]
    parts.append(
        f'<text x="800" y="820" fill="{fg}" font-family="sans-serif" font-size="28" text-anchor="middle">{label}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def pair(kind, label):
    return (
        data_uri(svg(**LIGHT, label=label, kind=kind)),
        data_uri(svg(**DARK, label=label, kind=kind)),
    )


def bars(title, rows, unit, caption):
    """Horizontal bar picture. Labels carry the unit, fixture and window."""
    width, row_h, top = 720, 34, 70
    height = top + row_h * len(rows) + 40
    longest = max(value for _, value in rows) or 1
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text x="20" y="32" font-family="sans-serif" font-size="20" fill="#111418">{title}</text>',
        f'<text x="20" y="54" font-family="sans-serif" font-size="12" fill="#5b6470">{caption}</text>',
    ]
    for index, (label, value) in enumerate(rows):
        y = top + index * row_h
        bar = round(360 * value / longest)
        parts += [
            f'<text x="20" y="{y + 15}" font-family="sans-serif" font-size="13" fill="#111418">{label}</text>',
            f'<rect x="240" y="{y}" width="{bar}" height="18" rx="4" fill="#2f6fed"/>',
            f'<text x="{250 + bar}" y="{y + 14}" font-family="sans-serif" font-size="12" fill="#111418">{value} {unit}</text>',
        ]
    parts.append("</svg>")
    return data_uri("".join(parts))


def phases(title, rows, caption):
    """Interaction timeline: named actions laid out end to end in wall-clock order."""
    width, y = 900, 96
    total = sum(value for _, value in rows) or 1
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="210" viewBox="0 0 {width} 210">',
        f'<rect width="{width}" height="210" fill="#ffffff"/>',
        f'<text x="20" y="32" font-family="sans-serif" font-size="20" fill="#111418">{title}</text>',
        f'<text x="20" y="54" font-family="sans-serif" font-size="12" fill="#5b6470">{caption}</text>',
    ]
    x = 20
    for index, (label, value) in enumerate(rows):
        span = round(860 * value / total)
        parts += [
            f'<rect x="{x}" y="{y}" width="{span}" height="40" rx="4" fill="{"#2f6fed" if index % 2 == 0 else "#7aa2f7"}"/>',
            f'<text x="{x + 8}" y="{y + 25}" font-family="sans-serif" font-size="13" fill="#ffffff">{label}</text>',
            f'<text x="{x + 8}" y="{y + 58}" font-family="sans-serif" font-size="12" fill="#111418">{value} ms</text>',
        ]
        x += span + 4
    parts.append("</svg>")
    return data_uri("".join(parts))


def series(title, points, caption):
    """Line picture for baseline -> peak -> recovery, with a marker per cycle."""
    width, height, base = 760, 240, 180
    peak = max(value for _, value in points) or 1
    step = (width - 80) / max(1, len(points) - 1)
    coords = [(40 + index * step, base - (base - 60) * value / peak) for index, (_, value) in enumerate(points)]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text x="20" y="32" font-family="sans-serif" font-size="20" fill="#111418">{title}</text>',
        f'<text x="20" y="54" font-family="sans-serif" font-size="12" fill="#5b6470">{caption}</text>',
        f'<polyline fill="none" stroke="#2f6fed" stroke-width="3" points="{" ".join(f"{x},{y}" for x, y in coords)}"/>',
    ]
    for (label, value), (x, y) in zip(points, coords):
        parts += [
            f'<circle cx="{x}" cy="{y}" r="4" fill="#2f6fed"/>',
            f'<text x="{x - 14}" y="{y - 12}" font-family="sans-serif" font-size="12" fill="#111418">{value}</text>',
            f'<text x="{x - 20}" y="{base + 20}" font-family="sans-serif" font-size="11" fill="#5b6470">{label}</text>',
        ]
    parts.append("</svg>")
    return data_uri("".join(parts))


def stack(title, rows, caption):
    """Wall-clock phases and CPU attribution as SEPARATE bars, never summed."""
    width, row_h, top = 780, 52, 76
    height = top + row_h * len(rows) + 30
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text x="20" y="32" font-family="sans-serif" font-size="20" fill="#111418">{title}</text>',
        f'<text x="20" y="54" font-family="sans-serif" font-size="12" fill="#5b6470">{caption}</text>',
    ]
    for index, (label, segments) in enumerate(rows):
        y = top + index * row_h
        total = sum(value for _, value in segments) or 1
        x = 160
        parts.append(f'<text x="20" y="{y + 20}" font-family="sans-serif" font-size="13" fill="#111418">{label}</text>')
        for seg_index, (seg_label, value) in enumerate(segments):
            span = round(560 * value / total)
            fill = ["#2f6fed", "#7aa2f7", "#b8c7f0"][seg_index % 3]
            parts += [
                f'<rect x="{x}" y="{y}" width="{span}" height="26" rx="4" fill="{fill}"/>',
                f'<text x="{x + 6}" y="{y + 18}" font-family="sans-serif" font-size="12" fill="#ffffff">{seg_label} {value} ms</text>',
            ]
            x += span + 2
    parts.append("</svg>")
    return data_uri("".join(parts))


def build_manifest():
    empty_light, empty_dark = pair("empty", "Empty state")
    form_light, form_dark = pair("form", "Tool options panel")
    dialog_light, _ = pair("dialog", "Confirm dialog")
    mobile_light, mobile_dark = pair("empty", "Mobile upload")
    tauri_light, tauri_dark = pair("form", "Settings panel (Tauri)")

    views = [
        {
            "id": "01_empty",
            "title": "Empty state",
            "platform": "desktop-web",
            "runner": "Playwright chromium (stubbed)",
            "viewport": "1600x900",
            "light": empty_light,
            "dark": empty_dark,
            "notes": ["Mock data: this example is not a real capture run."],
            "capture": {"build": "production", "instrumented": False, "fixture": "empty workspace"},
        },
        {
            "id": "02_form",
            "title": "Tool options panel",
            "platform": "desktop-web",
            "runner": "Playwright chromium (stubbed)",
            "viewport": "1600x900",
            "light": form_light,
            "dark": form_dark,
            "notes": ["Preset controls and the export button."],
            "capture": {"build": "production", "instrumented": False, "fixture": "report.pdf 2.4 MB"},
        },
        {
            "id": "03_dialog",
            "title": "Confirm dialog",
            "platform": "desktop-web",
            "runner": "Playwright chromium (stubbed)",
            "viewport": "1600x900",
            "light": dialog_light,
            "notes": ["Dark capture not taken: the runner stopped before the dark pass."],
            "capture": {"build": "production", "instrumented": False, "fixture": "report.pdf 2.4 MB"},
        },
        {
            "id": "04_mobile_upload",
            "title": "Upload (mobile web)",
            "platform": "mobile-web",
            "runner": "Playwright chromium device emulation",
            "viewport": "390x844",
            "light": mobile_light,
            "dark": mobile_dark,
            "notes": ["Emulated viewport, not a mobile Tauri run."],
            "capture": {"build": "production", "instrumented": False, "fixture": "empty workspace"},
        },
        {
            "id": "05_tauri_settings",
            "title": "Settings panel (Tauri)",
            "platform": "windows-tauri",
            "runner": "Tauri WebView2 on Windows 11",
            "viewport": "1440x900",
            "light": tauri_light,
            "dark": tauri_dark,
            "notes": ["Physical machine, no emulator."],
            "capture": {"build": "production", "instrumented": False, "fixture": "installed build 1.2.3"},
        },
    ]

    desktop_pictures = {
        "timeline": {
            "title": "Interaction timeline",
            "src": phases(
                "Open dialog, change preset, export",
                [("Open dialog", 180), ("Change preset", 90), ("Export (prepare)", 1240), ("UI idle again", 60)],
                "desktop web - report.pdf 2.4 MB - 5 open/use/close cycles, median cycle",
            ),
            "caption": "Export preparation dominates; the dialog itself is cheap.",
            "artifact": "traces/desktop-export.trace.json",
        },
        "workBreakdown": {
            "title": "Work breakdown",
            "src": stack(
                "Where the 1240 ms export went",
                [
                    ("wall clock", [("request", 420), ("engine", 640), ("ui", 180)]),
                    ("CPU attribution", [("scripting", 130), ("layout", 40), ("paint", 25)]),
                ],
                "Measured separately: overlapping phases are never summed into one bar.",
            ),
            "caption": "Most of the wall clock is engine work, not main-thread scripting.",
            "artifact": "traces/desktop-export.trace.json",
        },
        "react": {
            "title": "React rendering",
            "src": bars(
                "Commits and render cost",
                [("ToolOptionsPanel", 34), ("DialogPortal", 9), ("Toolbar", 4)],
                "ms",
                "Scoped profiler subtree - not total interaction time",
            ),
            "caption": "Commit count is not cost; the panel's 34 ms of render work is the signal.",
            "artifact": "traces/desktop-react-profile.json",
        },
        "recovery": {
            "title": "Resource recovery",
            "src": series(
                "JS heap across 5 open/use/close cycles",
                [
                    ("baseline", 82),
                    ("cycle 1", 148),
                    ("cycle 2", 156),
                    ("cycle 3", 158),
                    ("cycle 4", 157),
                    ("after close", 96),
                ],
                "Production build - MB - retention settles high, which is retention, not proven leak",
            ),
            "caption": "Heap rises then flattens; the post-close value stays above baseline.",
            "artifact": "traces/desktop-heap.json",
        },
        "mainThread": {
            "title": "Main-thread timeline",
            "src": phases(
                "Main thread during export",
                [("idle", 160), ("serialize", 340), ("blocked", 610), ("paint", 90), ("idle", 40)],
                "Longest task 610 ms - blocking contribution 560 ms beyond the 50 ms threshold",
            ),
            "caption": "One long task covers most of the export; the UI cannot respond inside it.",
            "artifact": "traces/desktop-mainthread.json",
        },
        "hotspot": {
            "title": "Hotspot breakdown",
            "src": bars(
                "Self time in the 610 ms long task",
                [("PDFDocument.save", 410), ("toBase64", 120), ("layout", 50)],
                "ms",
                "Trace-derived self time - build the flame chart from the trace, never from this picture",
            ),
            "caption": "Serialization is the hotspot; attribution comes from the trace below.",
            "artifact": "traces/desktop-mainthread.json",
        },
        "responsiveness": {
            "title": "Responsiveness comparison",
            "src": bars(
                "Interaction duration (base vs head)",
                [("base export", 1680), ("head export", 1240)],
                "ms",
                "Same host, fixture, build mode and instrumentation - comparable",
            ),
            "caption": "Head is faster, and the long task shrank with it.",
            "artifact": "traces/head-vs-base.json",
        },
    }

    tauri_pictures = {
        "timeline": {
            "title": "Interaction timeline",
            "src": phases(
                "Print from the Tauri shell",
                [("Open print panel", 240), ("Native dialog", 380), ("Spool to OS", 900), ("Recover", 80)],
                "Windows Tauri - WebView2 - installed build - physical machine",
            ),
            "caption": "Most of the time is in the WebView2/native handoff, not in the page.",
            "artifact": "traces/tauri-print.json",
        },
        "mainThread": {
            "title": "Main-thread timeline",
            "src": phases(
                "WebView2 main thread while printing",
                [("idle", 300), ("script", 120), ("idle", 1180)],
                "Native spooling happens off the WebView main thread",
            ),
            "caption": "No long task here: the wait is native, and is labelled as such.",
            "artifact": "traces/tauri-print.json",
        },
    }

    interactions = [
        {
            "id": "desktop-export",
            "name": "Open dialog, change preset, export",
            "platform": "desktop-web",
            "window": "idle baseline, the interaction, then recovery after close",
            "fixture": "report.pdf 2.4 MB",
            "provenance": {
                "environment": "macOS 15 / Chromium 140",
                "build": "production, uninstrumented",
                "collection": "Chrome Performance Monitor + CDP trace, sampled every 500 ms",
                "cycles": "5 open/use/close cycles",
                "limitations": "Sampling is coarse by design; escalate to a trace before naming a hotspot.",
            },
            "metrics": {
                "dom": {"baseline": "1,204 nodes", "peak": "2,410 nodes", "final": "1,238 nodes"},
                "react": {"commits": "47", "renderMs": "34 ms (scoped subtree)"},
                "memory": {
                    "jsHeapPeakMb": "158 MB",
                    "retainedMb": "14 MB above baseline after close",
                    "processPeakMb": None,
                },
                "cpu": {"busyMs": "980 ms across the window", "samples": "2,140 samples"},
                "rendering": {
                    "styleRecalcMs": "68 ms",
                    "layoutMs": "41 ms",
                    "longTasks": "3",
                    "longestTaskMs": "610 ms",
                },
                "network": {"requests": "4", "bytes": "3.1 MB", "ipcSpans": "0 (browser build)"},
                "resources": {"activeUrls": "2", "workers": "0", "subscriptions": "1", "tempFiles": "1"},
            },
            "pictures": desktop_pictures,
            "comparison": {
                "label": "comparable",
                "note": "Base and head share host, fixture, build mode and instrumentation.",
            },
        },
        {
            "id": "tauri-print",
            "name": "Print the document",
            "platform": "windows-tauri",
            "window": "idle baseline, print, recovery",
            "fixture": "installed build 1.2.3, report.pdf 2.4 MB",
            "provenance": {
                "environment": "Windows 11 / WebView2 131",
                "build": "production, uninstrumented",
                "collection": "WebView devtools for page metrics; native spans from the app log",
                "limitations": "Native allocations are not visible to the WebView profiler.",
            },
            "metrics": {
                "dom": {"baseline": "1,180 nodes", "peak": "1,402 nodes", "final": "1,186 nodes"},
                "react": None,
                "memory": {"jsHeapPeakMb": "91 MB", "retainedMb": None, "processPeakMb": None},
                "cpu": {"busyMs": "120 ms on the main thread", "samples": "not exposed by WebView2"},
                "rendering": {"styleRecalcMs": "9 ms", "layoutMs": "4 ms", "longTasks": "0", "longestTaskMs": "0"},
                "network": {"requests": "0", "bytes": "0", "ipcSpans": "2 native handoffs"},
                "resources": {"activeUrls": "0", "workers": "0", "subscriptions": "0", "tempFiles": "1"},
            },
            "pictures": tauri_pictures,
        },
    ]

    lighthouse_runs = [
        {
            "formFactor": "Desktop",
            "route": "/tools/compress",
            "mode": "state preserving (dialog open, file loaded)",
            "scores": {"performance": 88, "accessibility": 96, "bestPractices": 100, "seo": 60},
            "diagnostics": {
                "lcp": "1.9 s",
                "cls": "0.01",
                "tbt": "120 ms",
                "fcp": "1.1 s",
                "si": "2.4 s",
            },
            "a11yFailures": [
                {
                    "id": "label",
                    "impact": "serious",
                    "description": "Form element has no accessible label",
                    "elements": ['<input class="preset-name">'],
                }
            ],
            "artifacts": {"html": "lh/desktop.html", "json": "lh/desktop.json"},
            "environment": {
                "lighthouse": "12.6.1",
                "chrome": "140.0.7339",
                "throttling": "Simulated 4G, 4x CPU",
                "storage": "clean profile, seeded fixture",
                "build": "production",
            },
            "limitations": [
                "SEO is reported for completeness; the editor is not a crawlable content route.",
                "Page-load TBT does not describe responsiveness during export.",
            ],
        },
        {
            "formFactor": "Mobile",
            "route": "/tools/compress",
            "mode": "page entry (cold load, no dialog)",
            "scores": {"performance": 74, "accessibility": 96, "bestPractices": 92, "seo": 60},
            "diagnostics": {"lcp": "3.1 s", "cls": "0.04", "tbt": "410 ms", "fcp": "1.6 s", "si": "4.2 s"},
            "a11yFailures": [
                {
                    "id": "target-size",
                    "impact": "critical",
                    "description": "Touch targets are smaller than 24px",
                    "elements": ['<button class="preset-chip">', '<button class="icon-only">'],
                }
            ],
            "artifacts": {"html": "lh/mobile.html", "json": "lh/mobile.json"},
            "environment": {
                "lighthouse": "12.6.1",
                "chrome": "140.0.7339",
                "throttling": "Mobile Slow 4G, 4x CPU",
                "storage": "clean profile, seeded fixture",
                "build": "production",
            },
            "limitations": [
                "Mobile emulation is not an Android or iOS Tauri measurement.",
                "This run covers page entry only; the dialog state is not audited here.",
            ],
        },
    ]

    findings = {
        "visual": [
            {
                "severity": "high",
                "view": "03_dialog",
                "title": "Dialog buttons are too close together",
                "detail": "Confirm and Cancel sit 8 px apart, so the destructive choice is easy to hit by accident.",
                "fix": "Increase the gap to the 12 px spacing token.",
                "environment": "desktop web, production build",
                "confidence": "Certain from the light capture.",
                "limitations": "No dark capture for this view, so dark spacing is unverified.",
            },
            {
                "severity": "low",
                "view": "02_form",
                "title": "Field labels lose contrast in dark mode",
                "detail": "Muted labels over the dark panel fall below the 4.5:1 text ratio.",
                "fix": "Use the muted-strong token in dark mode.",
                "environment": "desktop web, production build",
                "confidence": "Measured against the dark capture.",
            },
        ],
        "ux": [
            {
                "severity": "med",
                "view": "01_empty",
                "title": "Primary action sits below the dropzone",
                "detail": "On a fresh workspace the CTA is the second thing the eye reaches.",
                "fix": "Move the CTA above the dropzone or make the dropzone itself the button.",
                "confidence": "Likely; no usability session behind it.",
            }
        ],
        "behavior": [
            {
                "severity": "med",
                "view": "01_empty",
                "title": "No visible feedback while the file is opening",
                "detail": "The panel stays blank for roughly 400 ms before the toolbar appears.",
                "fix": "Show the existing skeleton loader during the open.",
                "confidence": "Visible in the capture run.",
            }
        ],
        "a11y": [
            {
                "severity": "high",
                "view": "04_mobile_upload",
                "title": "Upload control has no accessible name",
                "detail": "The icon-only upload button exposes no label to assistive technology.",
                "fix": "Add an aria-label and a visible tooltip.",
                "environment": "mobile web emulation",
                "evidence": "lh/mobile.json -> audits.label",
                "confidence": "Automated audit plus manual inspection.",
                "limitations": "Not verified with TalkBack on a physical device.",
            }
        ],
        "perf": [
            {
                "severity": "high",
                "view": "02_form",
                "title": "Export blocks the main thread for 610 ms",
                "detail": "Serialization runs synchronously inside the click handler; the UI cannot repaint or cancel.",
                "fix": "Move serialization into a worker and stream the result.",
                "environment": "macOS 15 / Chromium 140, production build, uninstrumented",
                "fixture": "report.pdf 2.4 MB",
                "window": "idle baseline, open/preset/export, recovery after close",
                "baseline": "82 MB JS heap",
                "peak": "158 MB JS heap",
                "recovered": "96 MB after close",
                "repeatedCycles": "5 cycles: 148, 156, 158, 157 MB peaks",
                "cause": "PDFDocument.save plus base64 encoding on the main thread",
                "evidence": "traces/desktop-mainthread.json",
                "picture": "traces/desktop-export.trace.json",
                "confidence": "High: trace-derived attribution.",
                "limitations": "Peak heap is not process memory; nothing here proves a leak.",
            }
        ],
        "native": [
            {
                "severity": "low",
                "view": "05_tauri_settings",
                "title": "Print spool time is invisible to the user",
                "detail": "The native spool takes 900 ms with no progress indication in the Tauri shell.",
                "fix": "Surface a native progress state while spooling.",
                "environment": "Windows 11 / WebView2 131, physical machine",
                "fixture": "installed build 1.2.3",
                "window": "idle baseline, print, recovery",
                "recovered": "DOM returns to 1,186 nodes",
                "cause": "OS spooler handoff",
                "evidence": "traces/tauri-print.json",
                "confidence": "Medium: app-log spans, not a native profiler.",
                "limitations": "Native allocations are not measurable from the WebView profiler.",
            }
        ],
    }

    return {
        "feature": "EXAMPLE - Compress PDF (mock data)",
        "branch": "demo",
        "generated": "example",
        "build": {"mode": "production", "instrumented": False, "commit": "example"},
        "coverage": {
            "expected": list(PLATFORMS),
            "captured": ["desktop-web", "mobile-web", "windows-tauri"],
        },
        "provenance": {
            "host": "macOS 15, Windows 11 (Tauri only)",
            "instrumentation": "Chrome Performance Monitor, CDP traces, Lighthouse",
            "limitations": [
                "This example is mock data: it demonstrates the report, not a real capture run.",
                "macOS, Linux, Android and iOS Tauri runners were not available, so the report is incomplete.",
                "Emulated mobile web is not a mobile Tauri measurement.",
            ],
        },
        "views": views,
        "findings": findings,
        "performance": {"interactions": interactions},
        "lighthouse": {"runs": lighthouse_runs},
    }


def main():
    data = build_manifest()
    out = HERE / "EXAMPLE.html"
    validation, notes = report.build(HERE / "report-template.html", data, out, base=HERE)
    for issue in validation + notes:
        print(issue)
    if report.errors(validation + notes):
        return 1
    print(f"wrote {out} ({json.dumps(data['coverage']['captured'])})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
