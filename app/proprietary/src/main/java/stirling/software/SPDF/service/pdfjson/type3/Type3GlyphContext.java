package stirling.software.SPDF.service.pdfjson.type3;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.apache.pdfbox.pdmodel.font.PDType3Font;

import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;

class Type3GlyphContext {
    private final Type3ConversionRequest request;
    private final Type3GlyphExtractor extractor;
    private final AtomicReference<List<Type3GlyphOutline>> glyphs = new AtomicReference<>();

    Type3GlyphContext(Type3ConversionRequest request, Type3GlyphExtractor extractor) {
        this.request = request;
        this.extractor = extractor;
    }

    public List<Type3GlyphOutline> getGlyphs() throws IOException {
        List<Type3GlyphOutline> cached = glyphs.get();
        if (cached == null) {
            cached =
                    extractor.extractGlyphs(
                            request.getDocument(),
                            request.getFont(),
                            request.getFontId(),
                            request.getPageNumber());
            glyphs.compareAndSet(null, cached);
        }
        return cached;
    }

    public PDType3Font getFont() {
        return request.getFont();
    }
}
