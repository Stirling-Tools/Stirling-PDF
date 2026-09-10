"""Fetch each concept's article title in every language we ship.

The title is that language's own name for the document type, which is a sourced
term rather than a guess. Redirects are followed so "Résumé" and "Delivery note"
resolve to whatever the canonical article is.
"""
import json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import concepts

HERE = os.path.dirname(os.path.abspath(__file__))
ISOS = [l.split("\t")[0].strip()
        for l in open(os.path.join(HERE, "languages.tsv"), encoding="utf8")
        if l.strip() and not l.startswith(("#", "tag"))]
# Wikipedia tags Norwegian Bokmal "nb" in langlinks while the wiki itself is "no".
LANG_ALIAS = {"nb": "no"}
UA = {"User-Agent": "StirlingPDF-classifier-terms/1.0"}
TITLES = sorted({t for _, cs in concepts.CONCEPTS for t, _, _ in cs}
                | {t for _, t in concepts.SIGNALS})

def api(params):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return {}

out = {}
missing = []
for i in range(0, len(TITLES), 12):
    batch = TITLES[i:i + 12]
    cont = {}
    collected = {}
    while True:
        params = {"action": "query", "titles": "|".join(batch), "prop": "langlinks",
                  "lllimit": "500", "redirects": "1", "format": "json",
                  "formatversion": "2"}
        params.update(cont)
        d = api(params)
        pages = d.get("query", {}).get("pages", [])
        # Map any redirect back to the title we asked for.
        back = {r["to"]: r["from"] for r in d.get("query", {}).get("redirects", [])}
        for p in pages:
            if p.get("missing"):
                missing.append(p.get("title"))
                continue
            asked = back.get(p["title"], p["title"])
            slot = collected.setdefault(asked, {})
            for link in p.get("langlinks", []):
                tag = LANG_ALIAS.get(link["lang"], link["lang"])
                if tag in ISOS:
                    slot[tag] = link["title"]
        if "continue" in d:
            cont = d["continue"]
            time.sleep(0.3)
        else:
            break
    out.update(collected)
    print(f"  {i + len(batch):3}/{len(TITLES)} titles", flush=True)
    time.sleep(0.4)

json.dump(out, open(os.path.join(HERE, "terms.json"), "w", encoding="utf8"),
          ensure_ascii=False, indent=1)
have = sum(len(v) for v in out.values())
print(f"\n{len(out)} titles resolved, {have} native terms, missing: {missing}")
cover = {iso: sum(1 for v in out.values() if iso in v) for iso in ISOS}
for iso in sorted(cover, key=lambda k: -cover[k]):
    print(f"  {iso} {cover[iso]}", end="")
print()
