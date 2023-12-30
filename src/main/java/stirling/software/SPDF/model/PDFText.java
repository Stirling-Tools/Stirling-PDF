package stirling.software.SPDF.model;

public class PDFText {
    private final int pageIndex;
    private final float x1;
    private final float y1;
    private final float x2;
    private final float y2;
    private final String text;

    public PDFText(int pageIndex, float x1, float y1, float x2, float y2, String text) {
        this.pageIndex = pageIndex;
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.text = text;
    }

    public int getPageIndex() {
        return pageIndex;
    }

    public float getX1() {
        return x1;
    }

    public float getY1() {
        return y1;
    }

    public float getX2() {
        return x2;
    }

    public float getY2() {
        return y2;
    }

    public String getText() {
        return text;
    }
}
