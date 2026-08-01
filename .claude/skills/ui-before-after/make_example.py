"""Build EXAMPLE.html from montage-template.html using REAL files-page shots as
stand-in before/after pairs (layout demo, not an actual PR diff). Inlines PNGs as
data URIs so the HTML is portable. Run: python make_example.py"""
import base64
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SHOTS = pathlib.Path(
    r"C:\Users\systo\git\Stirling-PDFNew\.claude\worktrees\kind-faraday-522a30"
    r"\frontend\editor\screenshots\files-page"
)


def uri(fname):
    p = SHOTS / fname
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() if p.exists() else None


data = {
    "pr": "DEMO",
    "title": "EXAMPLE — before/after montage (layout demo, real Files-page shots; not a real PR diff)",
    "base": "main", "head": "demo-branch",
    "cropSelector": "[data-sidebar=\"tool-panel\"]  (real runs crop to the side; these demo shots are full-page)",
    "tabs": [
        {"id": "files", "title": "Files page", "ctx": "Each row = one flow state; left = base branch, right = this PR.",
         "states": [
             {"name": "Empty folder", "before": uri("01_empty_state_ctas.png"), "after": uri("02_empty_state_storage_off.png")},
             {"name": "Files + details panel", "before": uri("03_subtoolbar_with_files.png"), "after": uri("06_details_panel_save_to_server.png")},
             {"name": "Delete folder confirm", "before": None, "after": uri("19_delete_folder_dialog.png"), "note": "New in this PR"},
         ]},
        {"id": "move", "title": "Move-to-folder dialog",
         "states": [
             {"name": "Dialog opened", "before": uri("07_move_dialog_collapsed.png"), "after": uri("08_move_dialog_create_folder_expanded.png")},
             {"name": "After folder created", "before": None, "after": uri("08b_move_dialog_after_create_folder.png"), "note": "New flow"},
         ]},
    ],
}

tpl = (HERE / "montage-template.html").read_text(encoding="utf-8")
out = re.sub(
    r"/\*__DATA__\*/.*?/\*__END__\*/",
    lambda _m: "/*__DATA__*/" + json.dumps(data) + "/*__END__*/",
    tpl, count=1, flags=re.S,
)
(HERE / "EXAMPLE.html").write_text(out, encoding="utf-8")
print("wrote", HERE / "EXAMPLE.html", "(", (HERE / "EXAMPLE.html").stat().st_size // 1024, "KB )")
