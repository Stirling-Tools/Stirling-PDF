import collections, json, os, re, sys, unicodedata

TRAIN_FRACTION = 0.5
MAX_WORDS = 18
MAX_EDGE_WORDS = 10
MIN_RATE = 0.0015
DISTINCT_RATIO = 3.0
CHAR_DISTINCT_RATIO = 8.0
MAX_ENGLISH_RATE = 0.002
CORPUS_ARTIFACTS = {"tom", "tomu", "tomun", "toma", "tomovi", "tomova", "mary",
                    "maria", "marie", "marija", "john", "ken", "bob", "jim",
                    "том", "мэри", "мері", "توم", "ماري"}

FOLD_PAIRS = [("ß","ss"),("æ","ae"),("œ","oe"),("ø","o"),("ł","l"),
              ("đ","d"),("ð","d"),("ı","i"),("þ","th")]

def fold(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    for a, b in FOLD_PAIRS:
        s = s.replace(a, b)
    return s

WORD = re.compile(r"[^\W\d_]+", re.UNICODE)
ASCII_LETTER = re.compile(r"[a-z]", re.I)

SR_CYR = {"а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"đ","е":"e","ж":"ž","з":"z",
          "и":"i","ј":"j","к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o",
          "п":"p","р":"r","с":"s","т":"t","ћ":"ć","у":"u","ф":"f","х":"h","ц":"c",
          "ч":"č","џ":"dž","ш":"š"}

def translit_sr(text):
    out = []
    for ch in text:
        low = ch.lower()
        rep = SR_CYR.get(low)
        out.append((rep.upper() if ch.isupper() else rep) if rep else ch)
    return "".join(out)

# Script ranges, and which of our languages each one can hold.
SCRIPTS = [
    ("cjk",        r"[一-鿿぀-ヿ]",  ["ja", "zh"]),
    ("hangul",     r"[가-힯ᄀ-ᇿ]",  ["ko"]),
    ("cyrillic",   r"[Ѐ-ԯ]",               ["ru", "uk", "bg"]),
    ("arabic",     r"[؀-ۿݐ-ݿ]",  ["ar", "fa"]),
    ("greek",      r"[Ͱ-Ͽ]",               ["el"]),
    ("devanagari", r"[ऀ-ॿ]",               ["hi"]),
    ("hebrew",     r"[֐-׿]",               ["he"]),
    ("thai",       r"[฀-๿]",               ["th"]),
    ("malayalam",  r"[ഀ-ൿ]",               ["ml"]),
    ("tibetan",    r"[ༀ-࿿]",               ["bo"]),
]
SCRIPT_CLAIMED = {l for _, _, ls in SCRIPTS for l in ls}
HERE = os.path.dirname(os.path.abspath(__file__))
ISOS = [l.split("\t")[0].strip()
        for l in open(os.path.join(HERE, "languages.tsv"), encoding="utf8")
        if l.strip() and not l.startswith(("#", "tag"))]

DEST = os.environ.get("CLASSIFIER_CORPUS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "corpus")
CORPUS_DIRS = ("corpora", "wiki")


def read(directory, iso):
    path = os.path.join(DEST, directory, f"{iso}.txt")
    if not os.path.exists(path):
        return []
    lines = [l.strip() for l in open(path, encoding="utf8") if l.strip()]
    return [translit_sr(l) for l in lines] if iso == "sr" else lines


def split_halves(iso):
    train, test = [], {}
    for directory in CORPUS_DIRS:
        lines = read(directory, iso)
        cut = int(len(lines) * TRAIN_FRACTION)
        train += lines[:cut]
        test[directory] = lines[cut:]
    return train, test

def counts(lines):
    freq, total = collections.Counter(), 0
    raw_forms = collections.defaultdict(collections.Counter)
    for line in lines:
        low = line.lower()
        for w in WORD.findall(low):
            f = fold(w)
            freq[f] += 1
            raw_forms[f][w] += 1
            total += 1
    return freq, max(total, 1), raw_forms

def char_counts(lines, exclude_ascii):
    c, n = collections.Counter(), 0
    for line in lines:
        for ch in line.lower():
            if ch.isalpha():
                n += 1
                if not (exclude_ascii and ASCII_LETTER.match(ch)):
                    c[ch] += 1
    return c, max(n, 1)

def distinctive_chars(mine, others, exclude_ascii):
    c, n = char_counts(mine, exclude_ascii)
    rivals = [char_counts(ls, exclude_ascii) for ls in others]
    keep = []
    for ch, k in c.most_common(40):
        rate = k / n
        if rate <= 0.0008:
            continue
        worst = max((rc[ch] / rn for rc, rn in rivals), default=0.0)
        if rate > worst * CHAR_DISTINCT_RATIO:
            keep.append(ch)
    return keep

def words_for(iso, group_freq, group_totals, english, raw_forms=None, pooled=False):
    f, n = group_freq[iso], group_totals[iso]
    rivals = [(group_freq[o], group_totals[o]) for o in group_freq if o != iso]
    pooled_counts, pooled_total = collections.Counter(), 0
    for rf, rt in rivals:
        pooled_counts += rf
        pooled_total += rt
    ef, en_total = english
    scored = []
    for w, c in f.items():
        if not (2 <= len(w) <= 7) or w in CORPUS_ARTIFACTS:
            continue
        rate = c / n
        if rate < MIN_RATE:
            continue
        if pooled:
            rival_rate = pooled_counts[w] / pooled_total if pooled_total else 0.0
        else:
            rival_rate = max((rf[w] / rt for rf, rt in rivals), default=0.0)
        if rival_rate * DISTINCT_RATIO > rate:
            continue
        if en_total and ef[w] / en_total > MAX_ENGLISH_RATE:
            continue
        scored.append((rate, w))
    scored.sort(reverse=True)
    return [w for _, w in scored[:MAX_WORDS if pooled else MAX_EDGE_WORDS]]


def profile_words(iso, group_freq, group_totals, english, raw_forms):
    mass = words_for(iso, group_freq, group_totals, english, pooled=True)
    edge = words_for(iso, group_freq, group_totals, english, pooled=False)
    merged = list(dict.fromkeys(mass + edge))
    return [raw_forms[w].most_common(1)[0][0] if raw_forms.get(w) else w
            for w in merged]

def english_baseline():
    """Keep the hand-curated English stopword list: it is the baseline every other
    profile is scored against, and a corpus-derived replacement measured worse."""
    current = json.load(open(os.path.join(HERE, "..", "languages.json"),
                             encoding="utf8"))
    return current["english"]["words"]


def main():
    train, test, raw = {}, {}, {}
    for iso in ISOS:
        train[iso], test[iso] = split_halves(iso)
        raw[iso] = train[iso]

    latin = [iso for iso in ISOS if iso not in SCRIPT_CLAIMED]
    print(f"latin group ({len(latin)}): {' '.join(latin)}")

    freq, totals, raws = {}, {}, {}
    for iso in ISOS:
        freq[iso], totals[iso], raws[iso] = counts(train[iso])
    english = (freq["en"], totals["en"])

    profiles = []
    # Latin: every language competes against the others and against English.
    for iso in latin:
        if iso == "en":
            continue
        ws = profile_words(iso, {k: freq[k] for k in latin},
                           {k: totals[k] for k in latin}, english, raws[iso])
        chars = distinctive_chars(train[iso], [train[o] for o in latin if o != iso], True)
        profiles.append({"language": iso, "words": ws,
                         "chars": ("[" + "".join(chars) + "]") if chars else None})

    # Each multi-language script separates its own members; no English involved.
    for sid, _, langs in SCRIPTS:
        members = [l for l in langs if raw.get(l)]
        if len(members) < 2:
            continue
        for iso in members:
            ws = profile_words(iso, {k: freq[k] for k in members},
                               {k: totals[k] for k in members},
                               (collections.Counter(), 0), raws[iso])
            chars = distinctive_chars(train[iso], [train[o] for o in members if o != iso], False)
            profiles.append({"language": iso, "words": ws,
                             "chars": ("[" + "".join(chars) + "]") if chars else None})
            print(f"  {sid}/{iso}: chars={''.join(chars[:12]) or '-'}")
            print(f"      {' '.join(ws) or '(none)'}")

    out = {
        "version": 3,
        "english": {"words": english_baseline()},
        "scripts": [{"id": sid, "range": rng, "languages": langs}
                    for sid, rng, langs in SCRIPTS],
        "latin": {"languages": [l for l in latin if l != "en"]},
        "profiles": profiles,
    }
    target = os.path.join(HERE, "..", "languages.json")
    with open(target, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"wrote {os.path.relpath(target)}")
    for directory in CORPUS_DIRS:
        out_dir = os.path.join(DEST, f"test_{directory}")
        os.makedirs(out_dir, exist_ok=True)
        for iso in ISOS:
            with open(os.path.join(out_dir, f"{iso}.txt"), "w", encoding="utf8") as fh:
                fh.write("\n".join(test[iso].get(directory, [])))
    print(f"{len(profiles)} profiles, held-out splits under {DEST}")

main()
