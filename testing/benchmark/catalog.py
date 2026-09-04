"""Parse api-docs -> per-endpoint request config for every file-processing POST.
Auto-assigns param values (default > first enum > type fallback) and an input fixture by heuristic.
Emits catalog.json. Special cases are handled by OVERRIDES."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "apidocs.json")))
PS = d["paths"]
COMPS = d.get("components", {}).get("schemas", {})


def resolve(s):
    if isinstance(s, dict) and "$ref" in s:
        return COMPS.get(s["$ref"].split("/")[-1], {})
    return s if isinstance(s, dict) else {}


# Fixtures available (name -> file). Kind tags let us route file fields to the right input.
PDF = "text-100p.pdf"
PDF_SMALL = "text-10p.pdf"
PDF_FORM = "form-20p.pdf"
IMG = "img.png"
OFFICE = "sample.odt"

# Param value chooser
def value_for(name, pv):
    pv = resolve(pv)
    t = pv.get("type")
    if "default" in pv and pv["default"] is not None:
        v = pv["default"]
        if isinstance(v, bool):
            return "true" if v else "false"  # Spring wants lowercase, not Python's True/False
        return str(v)
    if pv.get("enum"):
        return str(pv["enum"][0])
    if t == "boolean":
        return "false"
    if t in ("integer", "number"):
        return "1"
    # sensible fallbacks by field name
    n = name.lower()
    if "password" in n:
        return "test"
    if "page" in n:
        return "1"
    if "angle" in n:
        return "90"
    if "format" in n:
        return "png"
    return "1"


# fixture routing by file-field name / declared item type
def fixture_for(fieldname, pv, endpoint):
    n = fieldname.lower()
    ep = endpoint.lower()
    if "image" in n or "watermarkimage" in n or "stampimage" in n:
        return IMG, "image"
    if "/convert/img/pdf" in ep or ep.endswith("/img/pdf"):
        return IMG, "image"
    if "/convert/file/pdf" in ep or "/convert/markdown" in ep and "pdf" in ep.split("/")[-1]:
        return OFFICE, "office"
    return PDF, "pdf"


# Endpoints that need input we cannot synthesize generically, or that mutate server state / need auth.
# Mark them so the runner skips (recorded, not silently dropped).
SKIP = {
    "reason_auth_or_state": [
        "/auth/", "/admin/", "/invite/", "/team", "/user", "/api-key", "/session",
        "/database/import-database", "/pipeline/handleData",
    ],
    "reason_special_input": [
        "/convert/cbr/pdf", "/convert/cbz/pdf", "/convert/pdf/cbr",  # comic archives
        "/convert/eml/pdf", "/convert/ebook/pdf",  # eml / ebook
        "/convert/url/pdf",  # takes a URL not a file
        "/security/cert-sign", "/security/remove-cert-sign", "/security/validate-signature",
        "/security/verify-pdf",  # need certs/signed input
        "/misc/extract-attachments", "/misc/delete-attachment", "/misc/rename-attachment",
        "/misc/list-attachments",  # need a PDF with attachments
        "/ai/",  # need AI backend
        "/integration/", "/workflow/", "/storage/",  # need external config/state
    ],
}


def classify_skip(ep):
    for reason, pats in SKIP.items():
        for pat in pats:
            if pat in ep:
                return reason
    return None


# Per-endpoint fixes: right fixture, extra file fields, and structured JSON param payloads.
# Keyed by the generated `name`. Merged over the auto-config after build.
OV = {
    # content-dependent inputs
    "convert_pdf_csv":  {"fixture": "tables-50p.pdf"},
    "convert_pdf_xlsx": {"fixture": "tables-50p.pdf"},
    "convert_svg_pdf":  {"fixture": "sample.svg"},
    "convert_html_pdf": {"fixture": "sample.html"},
    "convert_markdown_pdf": {"fixture": "sample.md"},
    "convert_file_pdf": {"fixture": "sample.odt"},
    # extra file fields
    "misc_add-image": {"extra_files": [{"field": "imageFile", "fixture": "img.png"}]},
    "misc_add-attachments": {"extra_files": [{"field": "attachments", "fixture": "text-10p.pdf"}]},
    "general_overlay-pdfs": {"extra_files": [{"field": "overlayFiles", "fixture": "text-10p.pdf"}]},
    # structured payloads (form ops use the form-20p fixture; fields are f_<page>_<row>)
    "form_fill": {"fixture": "form-20p.pdf", "params_add": {"data": '{"f_0_0":"filled"}'}},
    "form_delete-fields": {"fixture": "form-20p.pdf", "params_add": {"names": '["f_0_0"]'}},
    "form_add-fields": {"fixture": "text-10p.pdf", "params_add": {
        "fields": '[{"name":"nf1","type":"text","page":1,"x":100,"y":100,"width":120,"height":18,"value":"x"}]'}},
    "form_edit-fields": {"fixture": "form-20p.pdf", "params_add": {
        "edits": '[{"name":"f_0_0","value":"edited"}]'}},
    "form_modify-fields": {"fixture": "form-20p.pdf", "params_add": {
        "updates": '[{"name":"f_0_0","value":"mod"}]'}},
    "general_edit-text": {"params_add": {
        "findReplaceOperations": '[{"find":"lorem","replace":"LOREM"}]'}},
    "general_edit-table-of-contents": {"params_add": {
        "bookmarkData": '[{"title":"Ch1","pageNumber":1,"children":[]}]'}},
    "misc_add-comments": {"params_add": {
        "comments": '[{"page":1,"x":100,"y":100,"text":"hi","author":"bench"}]'}},
    "security_redact-execute": {"params_add": {
        "redactions": '[{"page":1,"x":50,"y":50,"width":100,"height":20}]'}},
    "misc_ocr-pdf": {"fixture": "scanned-5p.pdf", "params_add": {
        "languages": "eng", "ocrType": "force-ocr", "ocrRenderType": "sandwich"}},
    "general_split-pdf-by-sections": {"params_add": {
        "horizontalDivisions": "1", "verticalDivisions": "2", "merge": "true"}},
    "security_add-watermark": {"params_add": {
        "watermarkType": "text", "watermarkText": "CONF", "alphabet": "roman", "fontSize": "30",
        "rotation": "0", "opacity": "0.5", "widthSpacer": "50", "heightSpacer": "50",
        "customColor": "#d3d3d3", "convertPDFToImage": "false"}},
    "convert_svg_pdf": {"fixture": "sample.svg", "params_add": {"combineIntoSinglePdf": "true"}},
    # filters get the scanned/mixed fixture so they have something to match (204 is still counted OK)
    "filter_filter-contains-image": {"fixture": "mixed-200p.pdf"},
}


def build():
    cat = []
    for p, v in PS.items():
        if "post" not in v:
            continue
        rb = v["post"].get("requestBody", {}).get("content", {})
        if "multipart/form-data" not in rb:
            continue
        sch = resolve(rb["multipart/form-data"].get("schema", {}))
        props = sch.get("properties", {})
        required = sch.get("required", [])
        file_fields = []
        multi = False
        for name, pv in props.items():
            rpv = resolve(pv)
            if rpv.get("format") == "binary":
                file_fields.append(name)
            elif rpv.get("type") == "array" and resolve(rpv.get("items", {})).get("format") == "binary":
                file_fields.append(name)
                multi = True
        if not file_fields:
            continue
        # scalar params (non-file)
        params = {}
        for name, pv in props.items():
            if name in file_fields:
                continue
            rpv = resolve(pv)
            if rpv.get("type") in ("string", "integer", "number", "boolean") or rpv.get("enum"):
                params[name] = value_for(name, pv)
        fx, kind = fixture_for(file_fields[0], props.get(file_fields[0], {}), p)
        cat.append({
            "endpoint": p,
            "group": p.split("/")[3] if len(p.split("/")) > 3 else "?",
            "name": p.replace("/api/v1/", "").replace("/", "_"),
            "file_field": file_fields[0],
            "file_fields": file_fields,
            "multi": multi,
            "fixture": fx,
            "input_kind": kind,
            "params": params,
            "required": required,
            "skip": classify_skip(p),
            "extra_files": [],
        })
    # apply overrides
    byname = {c["name"]: c for c in cat}
    for name, ov in OV.items():
        c = byname.get(name)
        if not c:
            continue
        if "fixture" in ov:
            c["fixture"] = ov["fixture"]
        if "extra_files" in ov:
            c["extra_files"] = ov["extra_files"]
        if "params_add" in ov:
            c["params"].update(ov["params_add"])
    return cat


if __name__ == "__main__":
    cat = build()
    json.dump(cat, open(os.path.join(HERE, "catalog.json"), "w"), indent=1)
    runnable = [c for c in cat if not c["skip"]]
    print("catalog: %d file-processing endpoints, %d runnable, %d skipped" %
          (len(cat), len(runnable), len(cat) - len(runnable)))
    from collections import Counter
    print("skip reasons:", dict(Counter(c["skip"] for c in cat if c["skip"])))
    print("\nrunnable by group:", dict(Counter(c["group"] for c in runnable)))
