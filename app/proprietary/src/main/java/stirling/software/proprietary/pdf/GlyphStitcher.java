package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import stirling.software.jpdfium.text.TextLine;

/**
 * Rebuilds assembled {@link Line}s from the extractor's {@link TextLine}s, folding in the narrow
 * glyph fragments PDFium emits for apostrophes, markers and bullets.
 */
final class GlyphStitcher {

    private GlyphStitcher() {}

    /** Width below which a TextLine is treated as a stray glyph fragment to be stitched. */
    private static final float GLYPH_WIDTH = 7.5f;

    /**
     * Merges narrow glyph fragments into the line they belong to: inline between two same-baseline
     * fragments, or appended/prepended at a line's edge.
     */
    static List<Line> stitchGlyphs(List<TextLine> raw) {
        List<TextLine> hosts = new ArrayList<>();
        List<TextLine> glyphs = new ArrayList<>();
        for (TextLine l : raw) {
            String t = stripSoftHyphens(l.text()).strip();
            if (t.isEmpty()) {
                continue;
            }
            if (l.width() < GLYPH_WIDTH && t.length() <= 2) {
                glyphs.add(l);
            } else {
                hosts.add(l);
            }
        }

        List<Line> lines =
                hosts.stream()
                        .map(l -> new Line(l, stripSoftHyphens(l.text())))
                        .collect(Collectors.toList());

        for (TextLine g : glyphs) {
            String gt = stripSoftHyphens(g.text()).strip();
            if (isBulletGlyph(gt)) {
                attachBullet(g, gt, lines);
            } else {
                attachInlineGlyph(g, gt, lines);
            }
        }
        return lines;
    }

    /**
     * Removes U+00AD SOFT HYPHEN, a break-opportunity marker PDFium hands back verbatim as {@code
     * ar<AD>e}.
     */
    private static String stripSoftHyphens(String text) {
        if (text.indexOf('­') < 0) {
            return text;
        }
        return text.replace("­", "");
    }

    private static boolean isBulletGlyph(String gt) {
        return "•".equals(gt) || "▪".equals(gt) || "◦".equals(gt);
    }

    /**
     * Attaches a bullet glyph to the line it introduces: the closest line beginning to its right,
     * at roughly the same height or just below.
     */
    private static void attachBullet(TextLine g, String gt, List<Line> lines) {
        Line best = null;
        float bestScore = Float.MAX_VALUE;
        for (Line h : lines) {
            if (h.x < g.x() - 2f) {
                continue;
            }
            float dy = g.y() - h.y;
            if (dy < -4f || dy > 28f) {
                continue;
            }
            float score = Math.abs(dy) + (h.x - g.x()) * 0.2f;
            if (score < bestScore) {
                bestScore = score;
                best = h;
            }
        }
        if (best != null && !best.text.startsWith("•")) {
            best.text = "• " + best.text;
            best.x = g.x();
        } else {
            lines.add(new Line(g, gt));
        }
    }

    /**
     * Stitches a narrow inline glyph into its line: between two same-baseline fragments, appended
     * to the line ending at it, or prepended to the one starting at it.
     */
    private static void attachInlineGlyph(TextLine g, String gt, List<Line> lines) {
        Line left = null;
        Line right = null;
        float lb = 7f;
        float rb = 7f;
        for (Line h : lines) {
            boolean sameBaseline = g.y() >= h.y - 4f && g.y() <= h.y + h.height + 5f;
            if (!sameBaseline) {
                continue;
            }
            float rightEdge = h.x + h.width;
            float dxLeft = Math.abs(rightEdge - g.x());
            if (dxLeft < lb) {
                lb = dxLeft;
                left = h;
            }
            float dxRight = Math.abs(h.x - g.x());
            if (dxRight < rb) {
                rb = dxRight;
                right = h;
            }
        }

        if (left != null && right != null && left != right && Math.abs(left.y - right.y) < 6f) {
            left.text = left.text + gt + right.text;
            left.width = (right.x + right.width) - left.x;
            left.absorb(g);
            left.absorb(right);
            lines.remove(right);
        } else if (left != null) {
            left.text = left.text + gt;
            left.width = Math.max(left.width, g.x() + g.width() - left.x);
            left.absorb(g);
        } else if (right != null) {
            right.text = gt + right.text;
            right.x = g.x();
            right.absorb(g);
        } else {
            lines.add(new Line(g, gt));
        }
    }
}
