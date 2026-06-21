#!/usr/bin/env python3
"""Generate WiX MSI branding bitmaps from the app icon + wordmark.

WiX requires two 24-bit BMPs at fixed sizes:
  banner.bmp  493x58   - top strip on most dialogs; title text sits on the LEFT,
                         so the logo goes on the RIGHT.
  dialog.bmp  493x312  - Welcome/Finish background; WiX draws its text on the RIGHT
                         (~x>=180px), so artwork must stay in the LEFT ~165px band.
Run from frontend/editor:  python src-tauri/windows/wix/gen-branding.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(HERE, "..", "..", "icons", "icon.png")
FONT = os.path.join(HERE, "..", "..", "..", "dist", "pdfjs", "standard_fonts",
                    "LiberationSans-Bold.ttf")
WHITE = (255, 255, 255)


def brand_red(icon):
    # Median of the most saturated red pixels = the logo red, for the "PDF" wordmark.
    px = icon.convert("RGBA").getdata()
    reds = [(r, g, b) for r, g, b, a in px if a > 200 and r > 120 and r - g > 50 and r - b > 50]
    if not reds:
        return (200, 70, 70)
    reds.sort(key=lambda c: c[0] - (c[1] + c[2]) / 2)
    return reds[len(reds) // 2]


def wordmark(height, red):
    # "Stirling" in near-black + "PDF" in brand red, transparent background, trimmed.
    f = ImageFont.truetype(FONT, height)
    a, b = "Stirling ", "PDF"
    tmp = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(tmp)
    wa = d.textlength(a, font=f)
    wb = d.textlength(b, font=f)
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (int(wa + wb) + 4, asc + desc + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((0, 0), a, font=f, fill=(27, 27, 27, 255))
    d.text((wa, 0), b, font=f, fill=red + (255,))
    return img.crop(img.getbbox())


def paste_center(canvas, img, cx, cy):
    canvas.paste(img, (int(cx - img.width / 2), int(cy - img.height / 2)), img)


def main():
    icon = Image.open(ICON).convert("RGBA")
    red = brand_red(icon)

    # --- banner.bmp: icon at the right edge ---
    banner = Image.new("RGB", (493, 58), WHITE)
    bi = icon.resize((46, 46), Image.LANCZOS)
    banner.paste(bi, (493 - 46 - 12, (58 - 46) // 2), bi)
    banner.save(os.path.join(HERE, "banner.bmp"), "BMP")

    # --- dialog.bmp: icon + wordmark stacked in the left band, text area kept white ---
    dialog = Image.new("RGB", (493, 312), WHITE)
    band = 165  # left artwork band; WiX text starts to the right of this
    di = icon.resize((96, 96), Image.LANCZOS)
    wm = wordmark(30, red)
    if wm.width > band - 24:
        wm = wm.resize((band - 24, round(wm.height * (band - 24) / wm.width)), Image.LANCZOS)
    gap = 16
    group_h = di.height + gap + wm.height
    top = (312 - group_h) // 2
    paste_center(dialog, di, band / 2, top + di.height / 2)
    paste_center(dialog, wm, band / 2, top + di.height + gap + wm.height / 2)
    dialog.save(os.path.join(HERE, "dialog.bmp"), "BMP")

    print(f"brand red {red}")
    print("wrote banner.bmp 493x58 and dialog.bmp 493x312")


if __name__ == "__main__":
    main()
