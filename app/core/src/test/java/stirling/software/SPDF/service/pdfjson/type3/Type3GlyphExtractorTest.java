package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;

class Type3GlyphExtractorTest {

    @Test
    void extractGlyphs_nullFont_throwsNPE() {
        Type3GlyphExtractor extractor = new Type3GlyphExtractor();
        PDDocument doc = mock(PDDocument.class);
        assertThrows(NullPointerException.class, () -> extractor.extractGlyphs(doc, null, "F1", 1));
    }

    @Test
    void extractGlyphs_nullCharProcs_returnsEmpty() throws IOException {
        Type3GlyphExtractor extractor = new Type3GlyphExtractor();
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        COSDictionary cosDict = mock(COSDictionary.class);
        when(font.getCOSObject()).thenReturn(cosDict);
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(null);

        List<Type3GlyphOutline> result = extractor.extractGlyphs(doc, font, "F1", 1);
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void extractGlyphs_emptyCharProcs_returnsEmpty() throws IOException {
        Type3GlyphExtractor extractor = new Type3GlyphExtractor();
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        COSDictionary cosDict = mock(COSDictionary.class);
        COSDictionary charProcs = new COSDictionary();
        when(font.getCOSObject()).thenReturn(cosDict);
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(charProcs);

        List<Type3GlyphOutline> result = extractor.extractGlyphs(doc, font, "F1", 1);
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void extractGlyphs_charProcNotStream_skipped() throws IOException {
        Type3GlyphExtractor extractor = new Type3GlyphExtractor();
        PDDocument doc = mock(PDDocument.class);
        PDType3Font font = mock(PDType3Font.class);
        COSDictionary cosDict = mock(COSDictionary.class);
        COSDictionary charProcs = new COSDictionary();
        // Add a non-stream entry
        charProcs.setItem(COSName.getPDFName("A"), new COSDictionary());
        when(font.getCOSObject()).thenReturn(cosDict);
        when(cosDict.getDictionaryObject(COSName.CHAR_PROCS)).thenReturn(charProcs);

        List<Type3GlyphOutline> result = extractor.extractGlyphs(doc, font, "F1", 1);
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }
}
