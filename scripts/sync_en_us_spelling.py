#!/usr/bin/env python3
"""Sync en-US translations from en-GB and normalise spelling variants.

Two jobs, one pass:

1. Copy every key that exists in en-GB but is missing from en-US into en-US,
   converting British spellings to American on the way in. Keys that only exist
   in en-US (e.g. SaaS-only strings) are left untouched.

2. Fix any American spellings that have leaked into the en-GB *values* by
   converting them back to British.

Rules that keep this safe:
  * Only the VALUE (the quoted right-hand side) is ever rewritten. TOML keys and
    section headers are never touched -- they are code identifiers.
  * Matching is whole-word and case-preserving, driven by an explicit word map.
    We never match on substrings/stems, so "parameters", "entire", "literal",
    "programmatically", "checkbox" etc. are never mangled.
  * Software-ambiguous words whose "British" form would be wrong in a UI
    (program, dialog, disk, check/cheque, story, catalog as a CS term...) are
    deliberately left out of the map. See AMBIGUOUS_NOTES.

Usage:
    python3 scripts/sync_en_us_spelling.py            # apply changes
    python3 scripts/sync_en_us_spelling.py --dry-run   # report only
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

LOCALES = Path(__file__).resolve().parent.parent / "frontend/editor/public/locales"
EN_US = LOCALES / "en-US/translation.toml"
EN_GB = LOCALES / "en-GB/translation.toml"

# --------------------------------------------------------------------------- #
# Spelling map: British (uk) -> American (us), as full whole words.
#
# Inflected forms are generated for the regular families so the map stays
# readable. Irregular / one-off pairs are listed explicitly at the bottom.
# --------------------------------------------------------------------------- #

# Words intentionally NOT mapped because the "British" form is wrong or
# ambiguous in a software UI context (documented, not applied):
AMBIGUOUS_NOTES = {
    "program/programme": "‘program’ is correct in British English for software.",
    "dialog/dialogue": "‘dialog’ is standard UI terminology (dialog box) in all locales.",
    "disk/disc": "‘disk’ is standard for storage in all locales.",
    "check/cheque": "‘check’ (verb/checkbox) is identical in both; only the money sense differs.",
    "analog/analogue": "rare in this UI and collides with technical usage.",
    "story/storey": "‘story’ (narrative/UI) is identical; only the building-floor sense differs.",
    "meter/metre": "‘meter’ (a device/‘metered’) is valid in British English too.",
}

uk_to_us: dict[str, str] = {}


def add(uk: str, us: str) -> None:
    """Register a British->American whole-word pair (lower-cased key)."""
    uk_to_us[uk.lower()] = us.lower()


# --- -our / -or family (colour -> color) ---------------------------------- #
# us = uk with the single 'our' turned into 'or'.
_OUR = [
    "colour",
    "colours",
    "coloured",
    "colouring",
    "colourful",
    "colourless",
    "colourise",
    "colourised",
    "colouriser",
    "favour",
    "favours",
    "favoured",
    "favouring",
    "favourite",
    "favourites",
    "favourable",
    "favourably",
    "favouritism",
    "behaviour",
    "behaviours",
    "behavioural",
    "neighbour",
    "neighbours",
    "neighbouring",
    "labour",
    "labours",
    "laboured",
    "labouring",
    "honour",
    "honours",
    "honoured",
    "honouring",
    "honourable",
    "humour",
    "humours",
    "humoured",
    "flavour",
    "flavours",
    "flavoured",
    "flavouring",
    "harbour",
    "harbours",
    "rumour",
    "rumours",
    "rumoured",
    "vapour",
    "vapours",
    "odour",
    "odours",
    "valour",
    "splendour",
    "armour",
    "armoured",
    "saviour",
    "saviours",
    "endeavour",
    "endeavours",
    "endeavoured",
    "parlour",
    "savour",
    "savoured",
    "savouring",
    "savoury",
    "candour",
    "demeanour",
    "rigour",
    "vigour",
]
for w in _OUR:
    add(w, w.replace("our", "or"))

# --- -re / -er family (centre -> center) ---------------------------------- #
_RE = {
    "centre": "center",
    "centres": "centers",
    "centred": "centered",
    "centring": "centering",
    "metre": "meter",
    "metres": "meters",  # length unit; ‘meter’ device excluded above
    "litre": "liter",
    "litres": "liters",
    "fibre": "fiber",
    "fibres": "fibers",
    # NB: ‘calibre’ is omitted -- in this codebase it is the proper noun
    # ‘Calibre’ (the e-book conversion tool), not the British ‘caliber’.
    "sombre": "somber",
    "spectre": "specter",
    "lustre": "luster",
    "theatre": "theater",
    "theatres": "theaters",
    "centimetre": "centimeter",
    "centimetres": "centimeters",
    "millimetre": "millimeter",
    "millimetres": "millimeters",
    "kilometre": "kilometer",
    "kilometres": "kilometers",
    "manoeuvre": "maneuver",
    "manoeuvres": "maneuvers",
}
for uk, us in _RE.items():
    add(uk, us)

# --- -ise / -isation family (organise -> organize) ------------------------ #
# Generate the regular inflections from a list of stems (the part before 'se').
_ISE_STEMS = [
    "organi",
    "recogni",
    "customi",
    "optimi",
    "authori",
    "reali",
    "finali",
    "initiali",
    "normali",
    "synchroni",
    "summari",
    "prioriti",
    "personali",
    "capitali",
    "categori",
    "standardi",
    "visuali",
    "apologi",
    "utili",
    "locali",
    "digiti",
    "moderni",
    "centrali",
    "minimi",
    "maximi",
    "emphasi",
    "characteri",
    "stabili",
    "generali",
    "specifi? ".strip(),  # codespell:ignore specifi
    "sterili",
    "neutrali",
    "saniti",
    "tokeni",
    "serie? ".strip(),  # codespell:ignore serie
    "alphabeti",
    "synthesi",
    "memori",
    "itemi",
    "colouri",
]
_ISE_STEMS = [s for s in _ISE_STEMS if s and not s.endswith("?")]
_ISE_SUFFIXES = [
    "se",
    "ses",
    "sed",
    "sing",
    "ser",  # codespell:ignore ser
    "sers",
    "sation",
    "sations",
]
for stem in _ISE_STEMS:
    for suf in _ISE_SUFFIXES:
        add(stem + suf, stem + suf.replace("s", "z", 1))

# -yse -> -yze verbs. Deliberately excludes the 3rd-person ‘analyses/analyzes’
# because it collides with the noun ‘analyses’ (identical in both locales), and
# ‘analysis/analyses’ which are spelled the same on both sides.
for uk, us in {
    "analyse": "analyze",
    "analysed": "analyzed",
    "analysing": "analyzing",
    "analyser": "analyzer",
    "paralyse": "paralyze",
    "paralysed": "paralyzed",
    "paralysing": "paralyzing",
    "catalyse": "catalyze",
    "catalysed": "catalyzed",
}.items():
    add(uk, us)

# --- doubled-l family (cancelled -> canceled) ----------------------------- #
_LL = {
    "cancelled": "canceled",
    "cancelling": "canceling",
    "labelled": "labeled",
    "labelling": "labeling",
    "modelled": "modeled",
    "modelling": "modeling",
    "signalled": "signaled",
    "signalling": "signaling",
    "travelled": "traveled",
    "travelling": "traveling",
    "traveller": "traveler",
    "travellers": "travelers",
    "fuelled": "fueled",
    "fuelling": "fueling",
    "marvellous": "marvelous",
    "counsellor": "counselor",
    "jewellery": "jewelry",
}
for uk, us in _LL.items():
    add(uk, us)

# single-l where US doubles it (enrol -> enroll, fulfil -> fulfill)
_L_TO_LL = {
    "enrol": "enroll",
    "enrols": "enrolls",
    "enrolment": "enrollment",
    "enrolments": "enrollments",
    "fulfil": "fulfill",
    "fulfils": "fulfills",
    "fulfilment": "fulfillment",
    "fulfilments": "fulfillments",
    "instalment": "installment",
    "instalments": "installments",
    "skilful": "skillful",
    "wilful": "willful",
}
for uk, us in _L_TO_LL.items():
    add(uk, us)

# --- -ce / -se nouns (licence -> license, defence -> defense) ------------- #
# Only the unambiguous noun forms; verb/adjective forms ‘licensed/licensing’
# are identical in both and are left alone.
_CE = {
    "licence": "license",
    "licences": "licenses",
    "defence": "defense",
    "defences": "defenses",
    "offence": "offense",
    "offences": "offenses",
    "pretence": "pretense",
}
for uk, us in _CE.items():
    add(uk, us)

# --- -ogue (catalogue -> catalog) ----------------------------------------- #
# Note: ‘dialogue/dialog’ and ‘analogue/analog’ are excluded (UI terminology).
_OGUE = {
    "catalogue": "catalog",
    "catalogues": "catalogs",
    "catalogued": "cataloged",
    "cataloguing": "cataloging",
}
for uk, us in _OGUE.items():
    add(uk, us)

# --- miscellaneous irregulars --------------------------------------------- #
_MISC = {
    "grey": "gray",
    "greys": "grays",
    "greyed": "grayed",
    "greying": "graying",
    "greyscale": "grayscale",
    "mould": "mold",
    "moulds": "molds",
    "sceptical": "skeptical",
    "sceptic": "skeptic",
    "scepticism": "skepticism",
    "aluminium": "aluminum",
    "artefact": "artifact",
    "artefacts": "artifacts",
    "speciality": "specialty",
    "specialities": "specialties",
    "judgement": "judgment",
    "judgements": "judgments",
    "acknowledgement": "acknowledgment",
    "acknowledgements": "acknowledgments",
    "kerb": "curb",
    "kerbs": "curbs",
    "tyre": "tire",
    "tyres": "tires",
    "sulphur": "sulfur",
    "enquiry": "inquiry",
    "enquiries": "inquiries",
    "ageing": "aging",
    "cancelled": "canceled",  # belt & braces (also in _LL)
    # NB: while/whilst, toward/towards, among/amongst are deliberately omitted.
    # They are lexical/register choices, not spelling variants -- and "while",
    # "toward", "among" are all valid British English. Converting them would be
    # intrusive and out of scope for a spelling pass.
}
for uk, us in _MISC.items():
    add(uk, us)

# Reverse map for fixing American spellings inside en-GB.
us_to_uk: dict[str, str] = {}
for uk, us in uk_to_us.items():
    # Don't overwrite a genuine British form that happens to equal another US form.
    us_to_uk.setdefault(us, uk)

# --------------------------------------------------------------------------- #
# Case-preserving whole-word replacement.
# --------------------------------------------------------------------------- #


def _match_case(template: str, replacement: str) -> str:
    if template.isupper():
        return replacement.upper()
    if template[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


# Literal technical tokens that must never be respelled, even though they look
# like convertible words. These are protocol/identifier strings, not prose.
PROTECTED = re.compile(
    r"Authorization(?=\s*:)"  # the HTTP "Authorization:" header
    r"|Authorization\s+header",
    re.IGNORECASE,
)
_SENTINEL = "\x00{}\x00"


def make_converter(mapping: dict[str, str]):
    if not mapping:
        return lambda text: (text, [])
    # Longest-first so multi-word/longer forms win; \b ensures whole words.
    pattern = re.compile(
        r"\b("
        + "|".join(re.escape(w) for w in sorted(mapping, key=len, reverse=True))
        + r")\b",
        re.IGNORECASE,
    )

    def convert(text: str) -> tuple[str, list[tuple[str, str]]]:
        # Mask protected literals so they pass through untouched.
        protected: list[str] = []

        def mask(m: re.Match[str]) -> str:
            protected.append(m.group(0))
            return _SENTINEL.format(len(protected) - 1)

        masked = PROTECTED.sub(mask, text)

        changes: list[tuple[str, str]] = []

        def repl(m: re.Match[str]) -> str:
            src = m.group(0)
            dst = _match_case(src, mapping[src.lower()])
            if dst != src:
                changes.append((src, dst))
            return dst

        converted = pattern.sub(repl, masked)
        for i, original in enumerate(protected):
            converted = converted.replace(_SENTINEL.format(i), original)
        return converted, changes

    return convert


uk_to_us_convert = make_converter(uk_to_us)
us_to_uk_convert = make_converter(us_to_uk)

# --------------------------------------------------------------------------- #
# TOML line model (value-only edits; structure preserved verbatim).
# --------------------------------------------------------------------------- #

SECTION_RE = re.compile(r"^\[(.+)\]$")
KV_RE = re.compile(r'^([A-Za-z0-9_.-]+)\s*=\s*"(.*)"$')


def fq(section: str, key: str) -> str:
    return f"{section}.{key}" if section else key


def parse_keys(path: Path) -> tuple[dict[str, str], list[tuple[str, str, str]]]:
    """Return {fq_key: value} and an ordered list of (section, key, value)."""
    keys: dict[str, str] = {}
    ordered: list[tuple[str, str, str]] = []
    section = ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        sec = SECTION_RE.match(s)
        if sec:
            section = sec.group(1)
            continue
        kv = KV_RE.match(s)
        if kv:
            k, v = kv.group(1), kv.group(2)
            keys[fq(section, k)] = v
            ordered.append((section, k, v))
    return keys, ordered


def fix_en_gb(dry_run: bool) -> int:
    """Rewrite American spellings in en-GB values to British. Returns # changed."""
    out_lines: list[str] = []
    section = ""
    changed = 0
    report: list[str] = []
    for raw in EN_GB.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        sec = SECTION_RE.match(s)
        if sec:
            section = sec.group(1)
            out_lines.append(raw)
            continue
        kv = KV_RE.match(s)
        if not kv:
            out_lines.append(raw)
            continue
        key, value = kv.group(1), kv.group(2)
        new_value, edits = us_to_uk_convert(value)
        if edits:
            changed += 1
            for src, dst in edits:
                report.append(f"  [en-GB] {fq(section, key)}: {src} -> {dst}")
            indent = raw[: len(raw) - len(raw.lstrip())]
            out_lines.append(f'{indent}{key} = "{new_value}"')
        else:
            out_lines.append(raw)
    if report:
        print(f"en-GB: {changed} value(s) Americanised -> British:")
        print("\n".join(report))
    else:
        print("en-GB: no American spellings found in values.")
    if not dry_run and changed:
        EN_GB.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    return changed


def parse_structured(
    path: Path,
) -> tuple[list[tuple[str, str]], list[str], dict[str, list[tuple[str, str]]]]:
    """Return (top_level_kvs, section_order, {section: kvs}) preserving file order."""
    top: list[tuple[str, str]] = []
    order: list[str] = []
    sections: dict[str, list[tuple[str, str]]] = {}
    section = ""
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        sec = SECTION_RE.match(s)
        if sec:
            section = sec.group(1)
            if section not in sections:
                order.append(section)
                sections[section] = []
            continue
        kv = KV_RE.match(s)
        if kv:
            (top if section == "" else sections[section]).append(
                (kv.group(1), kv.group(2))
            )
    return top, order, sections


def _insert_ci(items: list, new, key_lower):
    """Insert `new` into `items` at the case-insensitive sorted position."""
    nk = key_lower(new)
    for i, existing in enumerate(items):
        if key_lower(existing) > nk:
            items.insert(i, new)
            return
    items.append(new)


def sync_en_us(dry_run: bool) -> int:
    """Regenerate en-US to mirror en-GB's structure, British->American.

    en-GB is the source of truth for which keys exist and in what order. For
    keys present in both, en-US keeps its own (US) wording; en-GB-only keys are
    added in their en-GB position; en-US-only keys/sections are slotted into the
    correct case-insensitive sorted position so the file stays ordered. Every
    value is run through the British->American converter.
    """
    us_keys, _ = parse_keys(EN_US)
    gb_keys, _ = parse_keys(EN_GB)
    gb_top, gb_order, gb_sections = parse_structured(EN_GB)
    us_top, us_order, us_sections = parse_structured(EN_US)

    added = [k for k in gb_keys if k not in us_keys]
    us_only = [k for k in us_keys if k not in gb_keys]

    def pick(section: str, key: str, gb_value: str) -> str:
        """Prefer en-US's own wording for shared keys; convert UK->US either way."""
        value = us_keys.get(fq(section, key), gb_value)
        return uk_to_us_convert(value)[0]

    # --- top-level keys: mirror en-GB, slot en-US-only keys in sorted order ---
    out_top: list[tuple[str, str]] = [(k, pick("", k, v)) for k, v in gb_top]
    gb_top_keys = {k for k, _ in gb_top}
    for k, v in us_top:
        if k not in gb_top_keys:
            _insert_ci(out_top, (k, uk_to_us_convert(v)[0]), lambda kv: kv[0].lower())

    # --- sections: mirror en-GB order/keys, merge en-US-only keys & sections ---
    out_sections: list[tuple[str, list[tuple[str, str]]]] = []
    for name in gb_order:
        gb_kvs = gb_sections[name]
        gb_section_keys = {k for k, _ in gb_kvs}
        merged = [(k, pick(name, k, v)) for k, v in gb_kvs]
        # en-US-only keys that belong to this (shared) section
        for k, v in us_sections.get(name, []):
            if k not in gb_section_keys:
                _insert_ci(
                    merged, (k, uk_to_us_convert(v)[0]), lambda kv: kv[0].lower()
                )
        out_sections.append((name, merged))

    # en-US-only sections (absent from en-GB): insert by ci header order
    gb_section_names = set(gb_order)
    for name in us_order:
        if name not in gb_section_names:
            kvs = [(k, uk_to_us_convert(v)[0]) for k, v in us_sections[name]]
            _insert_ci(out_sections, (name, kvs), lambda s: s[0].lower())

    # --- emit (top-level block, then one blank line before each section) ---
    lines: list[str] = [f'{k} = "{v}"' for k, v in out_top]
    for name, kvs in out_sections:
        lines.append("")
        lines.append(f"[{name}]")
        lines.extend(f'{k} = "{v}"' for k, v in kvs)

    print(
        f"en-US: +{len(added)} key(s) from en-GB, "
        f"{len(us_only)} en-US-only key(s) preserved (British->American applied)."
    )
    for k in added:
        print(f"  [en-US] + {k}")
    if not dry_run:
        EN_US.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(added)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--dry-run", action="store_true", help="report changes without writing"
    )
    args = ap.parse_args()

    if not EN_US.exists() or not EN_GB.exists():
        print(f"error: expected files under {LOCALES}", file=sys.stderr)
        return 1

    print(f"Spelling map: {len(uk_to_us)} British->American word forms.\n")
    added = sync_en_us(args.dry_run)
    print()
    fixed = fix_en_gb(args.dry_run)
    print()
    mode = "DRY RUN (no files written)" if args.dry_run else "written"
    print(f"Done [{mode}]: +{added} en-US key(s), {fixed} en-GB value(s) corrected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
