import hashlib
import io
import shutil
import sys
import tarfile
import urllib.request
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable
from fontTools.varLib import instancer

URW = Path("/usr/share/fonts/opentype/urw-base35")
GYRE = Path("/usr/share/texmf/fonts/opentype/public/tex-gyre")
GYRE_FAMILIES = ("adventor", "bonum", "cursor", "heros", "pagella", "schola", "termes")  # codespell:ignore heros
STYLES = {"Regular": (400, False), "Bold": (700, False), "Italic": (400, True), "BoldItalic": (700, True)}
VARIABLE = {
    "gelasio": ("Gelasio", "Gelasio[wght].ttf", "Gelasio-Italic[wght].ttf"),
    "ebgaramond": ("EBGaramond", "EBGaramond[wght].ttf", "EBGaramond-Italic[wght].ttf"),
    "inter": ("Inter", "Inter[opsz,wght].ttf", "Inter-Italic[opsz,wght].ttf"),
    "sourcesans3": ("SourceSans3", "SourceSans3[wght].ttf", "SourceSans3-Italic[wght].ttf"),
    "sourceserif4": ("SourceSerif4", "SourceSerif4[opsz,wght].ttf", "SourceSerif4-Italic[opsz,wght].ttf"),
    "sourcecodepro": ("SourceCodePro", "SourceCodePro[wght].ttf", "SourceCodePro-Italic[wght].ttf"),
    "inconsolata": ("Inconsolata", "Inconsolata[wdth,wght].ttf", None),
    "notoemoji": ("NotoEmoji", "NotoEmoji[wght].ttf", None),
    "roboto": ("Roboto", "Roboto[wdth,wght].ttf", "Roboto-Italic[wdth,wght].ttf"),
    "robotocondensed": ("RobotoCondensed", "RobotoCondensed[wght].ttf", "RobotoCondensed-Italic[wght].ttf"),
}
STATIC = {"comicneue": "ComicNeue-", "firasans": "FiraSans-", "firamono": "FiraMono-"}
ALIASES = {
    "Selawik": ("Segoe UI", "Segoe UI Light", "Segoe UI Semilight", "Segoe UI Semibold", "Segoe UI Black"),
    "Source Sans 3": ("Aptos", "Aptos Display", "Aptos Light", "Franklin Gothic", "Franklin Gothic Book",
                      "Franklin Gothic Medium", "Franklin Gothic Demi", "Franklin Gothic Heavy", "Candara"),
    "Roboto Condensed": ("Aptos Narrow", "Franklin Gothic Medium Cond", "Franklin Gothic Demi Cond", "Impact"),
    "Caladea": ("Aptos Serif",),
    "Source Code Pro": ("Aptos Mono", "Cascadia Code", "Cascadia Mono"),
    "Carlito": ("Calibri Light", "Corbel"),
    "Gelasio": ("Georgia",),
    "URW Gothic": ("Century Gothic",),
    "P052": ("Book Antiqua", "Palatino Linotype", "Palatino"),
    "URW Bookman": ("Bookman Old Style", "Bookman"),
    "C059": ("Century Schoolbook", "Century"),
    "Z003": ("Monotype Corsiva",),
    "EB Garamond": ("Garamond", "Baskerville Old Face", "Perpetua", "Goudy Old Style", "Californian FB", "Calisto MT"),
    "Comic Neue": ("Comic Sans MS",),
    "Inconsolata": ("Consolas",),
    "DejaVu Sans Mono": ("Lucida Console", "Lucida Sans Typewriter"),
    "DejaVu Sans": ("Verdana",),
    "DejaVu Sans Condensed": ("Tahoma",),
    "Fira Sans": ("Trebuchet MS",),
    "Lato": ("Gill Sans MT", "Gill Sans"),
    "Source Serif 4": ("Constantia", "Sitka Text", "Lucida Bright"),
    "Open Sans": ("Lucida Sans", "Lucida Sans Unicode", "Lucida Grande"),
}


def fontconfig(path):
    rules = "".join(f'  <alias binding="same">\n    <family>{family}</family>\n'
                    f'    <accept><family>{free}</family></accept>\n  </alias>\n'
                    for free, families in ALIASES.items() for family in families)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
                    + rules + "</fontconfig>\n", encoding="utf-8")


def fetch(manifest):
    files = {}
    for line in Path(manifest).read_text().splitlines():
        if line.strip():
            sha, name, url = line.split()
            data = urllib.request.urlopen(url, timeout=300).read()
            if hashlib.sha256(data).hexdigest() != sha:
                sys.exit(f"{name}: sha256 mismatch")
            files[name] = data
    return files


def quadratic(job):
    src, dst = job
    font = TTFont(src)
    order = font.getGlyphOrder()
    outlines = font.getGlyphSet()
    glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(outlines)
        outlines[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyf.glyphs[name] = pen.glyph()
    font["loca"] = newTable("loca")
    font["glyf"] = glyf
    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    glyf.compile(font)
    hmtx = font["hmtx"]
    for name, glyph in glyf.glyphs.items():
        if hasattr(glyph, "xMin"):
            hmtx[name] = (hmtx[name][0], glyph.xMin)
    maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    for field in ("maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
                  "maxStackElements", "maxSizeOfInstructions"):
        setattr(maxp, field, 1 if field == "maxZones" else 0)
    maxp.maxComponentElements = max(len(getattr(g, "components", [])) for g in glyf.glyphs.values())
    font["maxp"] = maxp
    post = font["post"]
    post.formatType = 2.0
    post.extraNames = []
    post.mapping = {}
    post.glyphOrder = order
    font.sfntVersion = "\000\001\000\000"
    dst.parent.mkdir(parents=True, exist_ok=True)
    font.save(dst)
    return dst


def instance(data, dst, weight):
    font = TTFont(io.BytesIO(data))
    axes = {a.axisTag: a.defaultValue for a in font["fvar"].axes}
    if "wght" in axes:
        axes["wght"] = weight
    static = instancer.instantiateVariableFont(font, axes, updateFontNames=True)
    dst.parent.mkdir(parents=True, exist_ok=True)
    static.save(dst)


def main():
    files = fetch(sys.argv[1])
    out = Path(sys.argv[2])
    fontconfig(Path(sys.argv[3]))
    jobs = [(p, out / "urw-base35" / (p.stem + ".ttf")) for p in sorted(URW.glob("*.otf"))]
    jobs += [(p, out / "tex-gyre" / (p.stem + ".ttf")) for p in sorted(GYRE.glob("texgyre*.otf"))
             if p.stem.split("-")[0][len("texgyre"):] in GYRE_FAMILIES]
    with ProcessPoolExecutor() as pool:
        list(pool.map(quadratic, jobs))
    shutil.copy("/usr/share/doc/fonts-urw-base35/copyright", out / "urw-base35" / "COPYING")
    shutil.copy("/usr/share/doc/fonts-texgyre/copyright", out / "tex-gyre" / "COPYING")
    for folder, (prefix, roman, italic) in VARIABLE.items():
        for style, (weight, slanted) in STYLES.items():
            source = italic if slanted else roman
            if source and (folder != "notoemoji" or style == "Regular"):
                instance(files[source], out / folder / f"{prefix}-{style}.ttf", weight)
    for folder, prefix in STATIC.items():
        for name, data in files.items():
            if name.startswith(prefix) and name.endswith(".ttf"):
                (out / folder).mkdir(parents=True, exist_ok=True)
                (out / folder / name).write_bytes(data)
    for name, data in files.items():
        if name.endswith("-OFL.txt"):
            (out / name[:-len("-OFL.txt")]).mkdir(parents=True, exist_ok=True)
            (out / name[:-len("-OFL.txt")] / "OFL.txt").write_bytes(data)
    with zipfile.ZipFile(io.BytesIO(files["Selawik_Release.zip"])) as z:
        for name in z.namelist():
            if name.endswith(".ttf"):
                (out / "selawik" / Path(name).name).write_bytes(z.read(name))
    with tarfile.open(fileobj=io.BytesIO(files["liberation-narrow-fonts-ttf-1.07.5.tar.gz"])) as t:
        for member in t.getmembers():
            name = Path(member.name).name
            if member.isfile() and (name.endswith(".ttf") or name in ("License.txt", "COPYING")):
                (out / "liberation-narrow").mkdir(parents=True, exist_ok=True)
                (out / "liberation-narrow" / name).write_bytes(t.extractfile(member).read())
    for path in sorted(out.rglob("*.ttf")):
        font = TTFont(path, lazy=True)
        if "glyf" not in font or "CFF " in font:
            sys.exit(f"{path}: no TrueType outlines")
        names = font["name"]
        family = names.getDebugName(16) or names.getDebugName(1)
        style = names.getDebugName(17) or names.getDebugName(2)
        print(f"{path.relative_to(out)}\t{family}\t{style}\t{font['OS/2'].usWeightClass}\t{path.stat().st_size}")


if __name__ == "__main__":
    main()
