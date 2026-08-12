"""Build a self-contained EXAMPLE.html from report-template.html with mock
light/dark screenshots, so the viewer + global theme slider can be demoed
without a real capture run. Run: python make_example.py"""
import base64
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent


def svg(bg, fg, panel, accent, muted, label, kind):
    """A simple fake 'screen' SVG: title bar, sidebar, content varies by kind."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">',
        f'<rect width="1600" height="900" fill="{bg}"/>',
        # top bar
        f'<rect width="1600" height="64" fill="{panel}"/>',
        f'<circle cx="40" cy="32" r="12" fill="{accent}"/>',
        f'<rect x="64" y="24" width="160" height="16" rx="6" fill="{muted}"/>',
        f'<rect x="1430" y="20" width="130" height="24" rx="12" fill="{accent}"/>',
        # left sidebar
        f'<rect x="0" y="64" width="220" height="836" fill="{panel}"/>',
    ]
    for i in range(6):
        y = 100 + i * 56
        parts.append(f'<rect x="24" y="{y}" width="172" height="32" rx="8" fill="{bg}"/>')
    if kind == "empty":
        parts += [
            f'<rect x="700" y="360" width="200" height="120" rx="16" fill="none" stroke="{muted}" stroke-width="3" stroke-dasharray="10 8"/>',
            f'<rect x="690" y="510" width="220" height="44" rx="10" fill="{accent}"/>',
            f'<text x="800" y="600" fill="{muted}" font-family="sans-serif" font-size="26" text-anchor="middle">{label}</text>',
        ]
    elif kind == "form":
        for i in range(4):
            y = 140 + i * 90
            parts.append(f'<rect x="280" y="{y}" width="160" height="16" rx="6" fill="{muted}"/>')
            parts.append(f'<rect x="280" y="{y+26}" width="900" height="44" rx="8" fill="{panel}" stroke="{muted}" stroke-width="1"/>')
        parts.append(f'<rect x="280" y="560" width="200" height="50" rx="10" fill="{accent}"/>')
        parts.append(f'<text x="800" y="850" fill="{muted}" font-family="sans-serif" font-size="24" text-anchor="middle">{label}</text>')
    else:  # dialog
        parts += [
            f'<rect width="1600" height="900" fill="{fg}" opacity="0.45"/>',
            f'<rect x="520" y="280" width="560" height="360" rx="18" fill="{panel}"/>',
            f'<rect x="556" y="320" width="280" height="22" rx="8" fill="{fg}"/>',
            f'<rect x="556" y="372" width="488" height="14" rx="6" fill="{muted}"/>',
            f'<rect x="556" y="398" width="420" height="14" rx="6" fill="{muted}"/>',
            f'<rect x="820" y="560" width="110" height="44" rx="9" fill="{bg}" stroke="{muted}"/>',
            f'<rect x="946" y="560" width="98" height="44" rx="9" fill="{accent}"/>',
            f'<text x="800" y="700" fill="#fff" font-family="sans-serif" font-size="24" text-anchor="middle">{label}</text>',
        ]
    parts.append("</svg>")
    return "".join(parts)


def data_uri(s):
    return "data:image/svg+xml;base64," + base64.b64encode(s.encode()).decode()


LIGHT = dict(bg="#ffffff", fg="#111418", panel="#f1f3f6", accent="#2f6fed", muted="#c2c8d0")
DARK = dict(bg="#16181c", fg="#000000", panel="#1f232a", accent="#5b8cff", muted="#3a414b")


def pair(kind, label):
    return (
        data_uri(svg(LIGHT["bg"], LIGHT["fg"], LIGHT["panel"], LIGHT["accent"], LIGHT["muted"], label, kind)),
        data_uri(svg(DARK["bg"], DARK["fg"], DARK["panel"], DARK["accent"], DARK["muted"], label, kind)),
    )


views = []
for idx, (kind, title, label) in enumerate([
    ("empty", "Empty state", "Drop a PDF to start"),
    ("form", "Tool options panel", "Compress options"),
    ("dialog", "Confirm dialog", "Replace original file?"),
], start=1):
    light, dark = pair(kind, label)
    views.append({
        "id": f"{idx:02d}_{kind}",
        "title": title,
        "light": light,
        "dark": dark,
        "viewport": "1600x900",
        "notes": ["This is mock data to demo the viewer."],
    })

data = {
    "feature": "EXAMPLE - Compress PDF (mock data)",
    "branch": "demo",
    "generated": "example",
    "views": views,
    "findings": {
        "visual": [
            {"severity": "high", "view": "03_dialog", "title": "Dialog buttons too close",
             "detail": "Cancel/Confirm have only 8px gap; easy to misclick.",
             "fix": "Increase gap to var(--mantine-spacing-md)."},
            {"severity": "low", "view": "02_form", "title": "Field labels low contrast in dark mode",
             "detail": "Muted token fails WCAG AA on the dark panel.",
             "fix": "Use --mantine-color-dimmed instead of a hard-coded grey."},
        ],
        "ux": [
            {"severity": "med", "view": "01_empty", "title": "Primary CTA below the dropzone",
             "detail": "Users expect the action button adjacent to the dropzone.",
             "fix": "Move the button directly under the dashed zone."},
        ],
    },
}

tpl = (HERE / "report-template.html").read_text(encoding="utf-8")
out = re.sub(
    r"/\*__DATA__\*/.*?/\*__END__\*/",
    lambda _m: "/*__DATA__*/" + json.dumps(data) + "/*__END__*/",
    tpl, count=1, flags=re.S,
)
(HERE / "EXAMPLE.html").write_text(out, encoding="utf-8")
print("wrote", (HERE / "EXAMPLE.html"))
