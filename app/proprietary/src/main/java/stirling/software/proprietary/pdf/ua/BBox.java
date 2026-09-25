package stirling.software.proprietary.pdf.ua;

/** An axis-aligned rectangle in PDF user space, with y increasing upwards. */
public record BBox(float x0, float y0, float x1, float y1) {

    public static final BBox EMPTY = new BBox(0, 0, 0, 0);

    public static BBox of(float x, float y, float width, float height) {
        return new BBox(x, y, x + width, y + height);
    }

    public float width() {
        return x1 - x0;
    }

    public float height() {
        return y1 - y0;
    }

    public float centreX() {
        return (x0 + x1) / 2f;
    }

    public BBox union(BBox other) {
        if (other == null || other.isEmpty()) {
            return this;
        }
        if (isEmpty()) {
            return other;
        }
        return new BBox(
                Math.min(x0, other.x0),
                Math.min(y0, other.y0),
                Math.max(x1, other.x1),
                Math.max(y1, other.y1));
    }

    public boolean isEmpty() {
        return x1 <= x0 || y1 <= y0;
    }

    /** Horizontal overlap with another box as a fraction of the narrower box's width. */
    public float horizontalOverlap(BBox other) {
        float overlap = Math.min(x1, other.x1) - Math.max(x0, other.x0);
        float narrower = Math.min(width(), other.width());
        return narrower <= 0 ? 0 : Math.max(0, overlap) / narrower;
    }
}
