package stirling.software.SPDF.service.PdfToJsonService;

public class FontStyle {
    public float size;
    public String font;
    public boolean isBold;
    public boolean isItalic;

    public FontStyle(float size, String font) {
        this.size = size;
        this.font = font;
        this.isBold = false;
        this.isItalic = false;
    }

    public FontStyle(float size, String font, boolean isBold, boolean isItalic) {
        this.size = size;
        this.font = font;
        this.isBold = isBold;
        this.isItalic = isItalic;
    }
}