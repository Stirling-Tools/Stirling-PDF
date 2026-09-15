import json, os, sys, time, urllib.parse, urllib.request, re

SEEDS = ["Water", "History", "Music", "Economy", "Law", "Mathematics", "Medicine",
         "Agriculture", "Architecture", "Bank", "Electricity", "Food", "Language",
         "Newspaper", "Railway", "School", "Telephone", "Theatre", "Transport",
         "University", "Insurance", "Tax", "Contract", "Invoice", "Company",
         "Government", "Climate", "Energy", "Library", "Photography"]
DEST = os.environ.get("CLASSIFIER_CORPUS", "corpus")
HERE = os.path.dirname(os.path.abspath(__file__))
ISOS = [l.split("\t")[0].strip()
        for l in open(os.path.join(HERE, "languages.tsv"), encoding="utf8")
        if l.strip() and not l.startswith(("#", "tag"))]
UA = {"User-Agent": "StirlingPDF-classifier-eval/1.0"}

def api(host, params):
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            time.sleep(1 + attempt)
    return {}

def titles_per_language():
    """English seed -> {lang: local title}."""
    mapping = {iso: [] for iso in ISOS}
    for i in range(0, len(SEEDS), 10):
        batch = SEEDS[i:i + 10]
        d = api("en.wikipedia.org", {
            "action": "query", "titles": "|".join(batch), "prop": "langlinks",
            "lllimit": "500", "format": "json", "formatversion": "2",
        })
        for page in d.get("query", {}).get("pages", []):
            for link in page.get("langlinks", []):
                if link["lang"] in mapping:
                    mapping[link["lang"]].append(link["title"])
        mapping["en"].extend(p["title"] for p in d.get("query", {}).get("pages", []))
        time.sleep(0.4)
    return mapping

def fetch(iso, titles):
    out = []
    for i in range(0, len(titles), 4):
        d = api(f"{iso}.wikipedia.org", {
            "action": "query", "titles": "|".join(titles[i:i + 4]),
            "prop": "extracts", "explaintext": "1", "format": "json",
            "formatversion": "2",
        })
        for page in d.get("query", {}).get("pages", []):
            text = re.sub(r"\s+", " ", page.get("extract") or "").strip()
            # Chop long articles into document-sized chunks.
            for j in range(0, min(len(text), 12000), 1500):
                chunk = text[j:j + 1500]
                if len(chunk) > 500:
                    out.append(chunk)
        time.sleep(0.3)
    return out

def main():
    os.makedirs(os.path.join(DEST, "wiki"), exist_ok=True)
    mapping = titles_per_language()
    for iso in ISOS:
        path = os.path.join(DEST, "wiki", f"{iso}.txt")
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            print(f"skip {iso}")
            continue
        titles = mapping.get(iso, [])
        if not titles:
            print(f"{iso}: no langlinks")
            continue
        docs = fetch(iso, titles)
        open(path, "w", encoding="utf8").write("\n".join(docs))
        print(f"{iso:3} {len(titles):3} titles -> {len(docs):4} chunks", flush=True)

main()
