"""Generate a language pack per language from the sourced native terms.

One high-weight phrase per label: the term that language uses for the document
type. That is the single most diagnostic rule a pack can have, and it is sourced
rather than guessed. Supporting field vocabulary is left for a native speaker -
these packs are a floor to build on, not a finished pack.
"""
import json, os, os, re, unicodedata
import concepts

HERE = os.path.dirname(os.path.abspath(__file__))
ISOS = [l.split("\t")[0].strip()
        for l in open(os.path.join(HERE, "languages.tsv"), encoding="utf8")
        if l.strip() and not l.startswith(("#", "tag"))]
TERMS = json.load(open(os.path.join(HERE, "terms.json"), encoding="utf8"))
# Hand-authored: the generator must not overwrite them.
SKIP = {"en", "de", "fr", "es", "it", "pt", "nl", "pl"}
OUT = os.path.join(HERE, "..", "packs")

PAREN = re.compile(r"\s*\([^)]*\)\s*$")
DIGIT = re.compile(r"\d")
LATIN = re.compile(r"[a-z]", re.I)
# Languages written in another script: a Latin-only term in their pack is an
# untranslated English stub, and would only ever fire on an English document.
NON_LATIN = {"ar", "bg", "bo", "el", "fa", "hi", "ja", "ko", "ml", "ru", "th", "uk", "zh"}
# Scripts where a two-character term is a whole word.
DENSE = re.compile(r"[぀-ヿ一-鿿가-힯฀-๿]")

def clean(title: str) -> str | None:
    t = PAREN.sub("", title).strip()
    t = re.sub(r"\s+", " ", t)
    if not t:
        return None
    if len(t.split(" ")) > 5:
        return None
    floor = 2 if DENSE.search(t) else 4
    if len(t) < floor:
        return None
    # A document type is never named with a number; "ISO 13616" is a standard, not
    # a heading anyone prints.
    if DIGIT.search(t):
        return None
    return t.lower()


def english_leak(native: str, english: str, iso: str) -> bool:
    """True when the langlink gave back the English term rather than a translation.

    Wikipedia hands back an English title wherever a wiki has no article of its
    own, and an English phrase inside a non-English pack fires only on English
    documents. A single-word match is kept, because genuine loanwords exist
    (patent, faktura, curriculum vitae); a multi-word English phrase never is.
    """
    a, b = clean(native), clean(english)
    if a is None or b is None or a != b:
        return False
    if len(b.split(" ")) > 1:
        return True
    return iso in NON_LATIN


def wrong_script(native: str, iso: str) -> bool:
    """A Latin-only term in a non-Latin pack cannot be that language's own word."""
    return iso in NON_LATIN and LATIN.search(native) is not None and not DENSE.search(native)

def build(iso: str):
    labels = []
    for label, specs in concepts.CONCEPTS:
        phrases = []
        seen = set()
        for title, weight, zone in specs:
            if weight <= 0:
                continue
            native = TERMS.get(title, {}).get(iso)
            if native is None:
                continue
            if english_leak(native, title, iso) or wrong_script(native, iso):
                continue
            text = clean(native)
            if text is None or text in seen:
                continue
            seen.add(text)
            # A sourced term with an untuned weight: discount it, and keep the
            # generic ones below what can emit a label unaided.
            adjusted = max(6, weight - 2)
            rule = {"text": text, "weight": adjusted}
            if zone != "any":
                rule["where"] = zone
            phrases.append(rule)
        for text, weight, zone in concepts.OVERRIDES.get(label, {}).get(iso, []):
            if text in seen:
                continue
            seen.add(text)
            rule = {"text": text, "weight": weight}
            if zone != "any":
                rule["where"] = zone
            phrases.append(rule)
        if phrases:
            labels.append({"id": label, "phrases": phrases})

    patterns = {}
    for group, title in concepts.SIGNALS:
        native = TERMS.get(title, {}).get(iso)
        if native is None:
            continue
        if english_leak(native, title, iso) or wrong_script(native, iso):
            continue
        text = clean(native)
        if text is None:
            continue
        patterns[group] = [{"pattern": re.escape(text)}]
    return labels, patterns

def dump(iso, labels, patterns):
    lines = ["{", '  "version": 2,', f'  "language": "{iso}",', '  "labels": [']
    for i, label in enumerate(labels):
        lines.append("    {")
        lines.append(f'      "id": {json.dumps(label["id"])},')
        lines.append('      "phrases": [')
        for j, r in enumerate(label["phrases"]):
            body = "{ " + ", ".join(
                f'"{k}": {json.dumps(v, ensure_ascii=False)}' for k, v in r.items()
            ) + " }"
            lines.append(f"        {body}" + ("," if j < len(label["phrases"]) - 1 else ""))
        lines.append("      ]")
        lines.append("    }" + ("," if i < len(labels) - 1 else ""))
    lines.append("  ]" + ("," if patterns else ""))
    if patterns:
        lines.append('  "patterns": {')
        keys = list(patterns)
        for i, g in enumerate(keys):
            body = "{ " + ", ".join(
                f'"{k}": {json.dumps(v, ensure_ascii=False)}'
                for k, v in patterns[g][0].items()
            ) + " }"
            lines.append(f'    "{g}": [{body}]' + ("," if i < len(keys) - 1 else ""))
        lines.append("  }")
    lines.append("}")
    os.makedirs(OUT, exist_ok=True)
    open(f"{OUT}/{iso}.json", "w", encoding="utf8").write("\n".join(lines) + "\n")

print(f"{'lang':5}{'labels':>8}{'phrases':>9}{'signals':>9}")
total = 0
for iso in ISOS:
    if iso in SKIP:
        continue
    labels, patterns = build(iso)
    if not labels:
        print(f"{iso:5}{'-':>8}  no terms - skipped")
        continue
    dump(iso, labels, patterns)
    n = sum(len(l["phrases"]) for l in labels)
    total += n
    print(f"{iso:5}{len(labels):>8}{n:>9}{len(patterns):>9}")
print(f"\n{total} phrases written to {os.path.relpath(OUT)}")
