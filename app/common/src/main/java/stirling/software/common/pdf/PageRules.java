package stirling.software.common.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.PageContentSummary;
import stirling.software.jpdfium.doc.PageObject;
import stirling.software.jpdfium.doc.PageObjectType;
import stirling.software.jpdfium.doc.PdfPageObjects;
import stirling.software.jpdfium.model.Rect;

/**
 * Ruling lines of one page, read from the page's PATH objects.
 *
 * <p>JPDFium exposes every vector path as a {@link PageObject} with a bounding box in the same user
 * space as the text lines, so a table's rules are directly addressable: a path whose box is long
 * and thin is a rule, and a path whose box is large in both axes is a box (a table border, a cell
 * outline or a shaded row fill) whose four edges are themselves boundaries.
 */
final class PageRules {

    /** A path this thin in its short axis is a rule rather than a filled area. */
    private static final float RULE_THICKNESS = 3f;

    /** A rule shorter than this is decoration (tick marks, bullets, glyph art). */
    private static final float MIN_RULE_LENGTH = 8f;

    /** Boxes larger than this in either axis are page furniture, not table structure. */
    private static final float MAX_BOX = 1500f;

    /**
     * Object count past which the page is not examined. Enumerating every object costs time
     * proportional to the count, and a page drawing this many is a chart, a map or an adversarial
     * operator flood, never a table whose grid we could read.
     */
    private static final int MAX_PAGE_OBJECTS = 20_000;

    /** A straight rule: {@code pos} is its y (horizontal) or x (vertical), spanning lo..hi. */
    record Rule(float pos, float lo, float hi) {}

    private final List<Rule> horizontal;
    private final List<Rule> vertical;

    private PageRules(List<Rule> horizontal, List<Rule> vertical) {
        this.horizontal = horizontal;
        this.vertical = vertical;
    }

    static final PageRules EMPTY = new PageRules(List.of(), List.of());

    List<Rule> horizontal() {
        return horizontal;
    }

    List<Rule> vertical() {
        return vertical;
    }

    boolean isEmpty() {
        return horizontal.isEmpty() && vertical.isEmpty();
    }

    /** Reads the ruling lines of an already-open page. */
    static PageRules of(PdfPage page) throws IOException {
        List<Rule> h = new ArrayList<>();
        List<Rule> v = new ArrayList<>();
        List<PageObject> objects;
        try {
            // Counting is far cheaper than materialising every object, so decide from the summary
            // whether the page is worth enumerating at all.
            PageContentSummary summary = PdfPageObjects.summarize(page.rawHandle());
            if (summary.pathObjectCount() < 2 || summary.totalObjects() > MAX_PAGE_OBJECTS) {
                return EMPTY;
            }
            objects = PdfPageObjects.list(page.rawHandle());
        } catch (RuntimeException e) {
            // Path enumeration is an optimisation, never a correctness requirement: a page whose
            // objects cannot be read simply falls back to word-grid detection.
            return EMPTY;
        }
        float pageW = 0f;
        float pageH = 0f;
        try {
            pageW = page.size().width();
            pageH = page.size().height();
        } catch (RuntimeException ignored) {
            // Fall through with 0,0: the on-page check below is then skipped.
        }
        for (PageObject o : objects) {
            if (o.type() != PageObjectType.PATH) {
                continue;
            }
            Rect b = o.bounds();
            if (b == null) {
                continue;
            }
            float w = b.width();
            float ht = b.height();
            if (!Float.isFinite(w) || !Float.isFinite(ht) || w < 0 || ht < 0) {
                continue;
            }
            if (w > MAX_BOX || ht > MAX_BOX) {
                continue;
            }
            // Paths that run off the page are chart clipping or decoration, never table structure.
            if (pageW > 0
                    && (b.x() < -1f
                            || b.y() < -1f
                            || b.x() + w > pageW + 1f
                            || b.y() + ht > pageH + 1f)) {
                continue;
            }
            if (ht <= RULE_THICKNESS && w >= MIN_RULE_LENGTH) {
                h.add(new Rule(b.y() + ht / 2f, b.x(), b.x() + w));
            } else if (w <= RULE_THICKNESS && ht >= MIN_RULE_LENGTH) {
                v.add(new Rule(b.x() + w / 2f, b.y(), b.y() + ht));
            } else if (w >= MIN_RULE_LENGTH && ht >= MIN_RULE_LENGTH) {
                // A box: a table border, a cell outline or a shaded row fill. Its edges bound cells
                // exactly as drawn rules do, and many generators draw grids as per-cell rectangles.
                h.add(new Rule(b.y(), b.x(), b.x() + w));
                h.add(new Rule(b.y() + ht, b.x(), b.x() + w));
                v.add(new Rule(b.x(), b.y(), b.y() + ht));
                v.add(new Rule(b.x() + w, b.y(), b.y() + ht));
            }
        }
        h.sort(Comparator.comparingDouble(Rule::pos).reversed());
        v.sort(Comparator.comparingDouble(Rule::pos));
        return new PageRules(h, v);
    }
}
