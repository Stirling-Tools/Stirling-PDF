package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;

class Type3GlyphContextTest {

    @Test
    void getFont_returnsFontFromRequest() {
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F1").pageNumber(1).build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        assertSame(font, ctx.getFont());
    }

    @Test
    void getGlyphs_delegatesToExtractor() throws IOException {
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .document(doc)
                        .font(font)
                        .fontId("F1")
                        .pageNumber(2)
                        .build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        List<Type3GlyphOutline> expected =
                List.of(
                        Type3GlyphOutline.builder()
                                .glyphName("A")
                                .charCode(65)
                                .advanceWidth(500f)
                                .build());
        when(extractor.extractGlyphs(doc, font, "F1", 2)).thenReturn(expected);

        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        List<Type3GlyphOutline> result = ctx.getGlyphs();
        assertSame(expected, result);
    }

    @Test
    void getGlyphs_cachesResult() throws IOException {
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .document(doc)
                        .font(font)
                        .fontId("F1")
                        .pageNumber(1)
                        .build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        List<Type3GlyphOutline> expected = List.of();
        when(extractor.extractGlyphs(doc, font, "F1", 1)).thenReturn(expected);

        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        List<Type3GlyphOutline> first = ctx.getGlyphs();
        List<Type3GlyphOutline> second = ctx.getGlyphs();
        assertSame(first, second);
        verify(extractor, times(1)).extractGlyphs(doc, font, "F1", 1);
    }

    @Test
    void getGlyphs_propagatesIOException() throws IOException {
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .document(doc)
                        .font(font)
                        .fontId("F1")
                        .pageNumber(1)
                        .build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        when(extractor.extractGlyphs(doc, font, "F1", 1))
                .thenThrow(new IOException("extraction failed"));

        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        assertThrows(IOException.class, ctx::getGlyphs);
    }

    @Test
    void getGlyphs_nullDocumentInRequest() throws IOException {
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder()
                        .document(null)
                        .font(font)
                        .fontId("F1")
                        .pageNumber(1)
                        .build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        when(extractor.extractGlyphs(null, font, "F1", 1)).thenReturn(List.of());

        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        List<Type3GlyphOutline> result = ctx.getGlyphs();
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void constructor_storesRequestAndExtractor() {
        PDType3Font font = mock(PDType3Font.class);
        Type3ConversionRequest request =
                Type3ConversionRequest.builder().font(font).fontId("F2").pageNumber(3).build();
        Type3GlyphExtractor extractor = mock(Type3GlyphExtractor.class);
        Type3GlyphContext ctx = new Type3GlyphContext(request, extractor);
        assertSame(font, ctx.getFont());
    }
}
