package stirling.software.SPDF.service.pdfjson.type3.model;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.geom.GeneralPath;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

class Type3GlyphOutlineTest {

    @Test
    void builder_allFields() {
        GeneralPath path = new GeneralPath();
        PDRectangle bbox = new PDRectangle(0, 0, 100, 100);
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder()
                        .glyphName("A")
                        .charCode(65)
                        .advanceWidth(500f)
                        .boundingBox(bbox)
                        .outline(path)
                        .hasFill(true)
                        .hasStroke(false)
                        .hasImages(false)
                        .hasText(false)
                        .hasShading(false)
                        .warnings("test warning")
                        .unicode(65)
                        .build();

        assertEquals("A", outline.getGlyphName());
        assertEquals(65, outline.getCharCode());
        assertEquals(500f, outline.getAdvanceWidth(), 0.001);
        assertSame(bbox, outline.getBoundingBox());
        assertSame(path, outline.getOutline());
        assertTrue(outline.isHasFill());
        assertFalse(outline.isHasStroke());
        assertFalse(outline.isHasImages());
        assertFalse(outline.isHasText());
        assertFalse(outline.isHasShading());
        assertEquals("test warning", outline.getWarnings());
        assertEquals(65, outline.getUnicode());
    }

    @Test
    void builder_minimalFields() {
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder()
                        .glyphName("space")
                        .charCode(32)
                        .advanceWidth(250f)
                        .build();

        assertEquals("space", outline.getGlyphName());
        assertEquals(32, outline.getCharCode());
        assertNull(outline.getBoundingBox());
        assertNull(outline.getOutline());
        assertNull(outline.getWarnings());
        assertNull(outline.getUnicode());
    }

    @Test
    void builder_negativeCharCode() {
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder()
                        .glyphName("unknown")
                        .charCode(-1)
                        .advanceWidth(0f)
                        .build();

        assertEquals(-1, outline.getCharCode());
    }

    @Test
    void builder_zeroAdvanceWidth() {
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder().glyphName("dot").charCode(46).advanceWidth(0f).build();

        assertEquals(0f, outline.getAdvanceWidth(), 0.001);
    }

    @Test
    void builder_nullGlyphName() {
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder().glyphName(null).charCode(0).advanceWidth(0f).build();

        assertNull(outline.getGlyphName());
    }

    @Test
    void builder_withAllFeatureFlags() {
        Type3GlyphOutline outline =
                Type3GlyphOutline.builder()
                        .glyphName("complex")
                        .charCode(100)
                        .advanceWidth(700f)
                        .hasFill(true)
                        .hasStroke(true)
                        .hasImages(true)
                        .hasText(true)
                        .hasShading(true)
                        .build();

        assertTrue(outline.isHasFill());
        assertTrue(outline.isHasStroke());
        assertTrue(outline.isHasImages());
        assertTrue(outline.isHasText());
        assertTrue(outline.isHasShading());
    }

    @Test
    void equals_sameValues() {
        Type3GlyphOutline a =
                Type3GlyphOutline.builder().glyphName("A").charCode(65).advanceWidth(500f).build();
        Type3GlyphOutline b =
                Type3GlyphOutline.builder().glyphName("A").charCode(65).advanceWidth(500f).build();
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }
}
