package stirling.software.SPDF.model.json;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("PdfJsonFontType3Glyph")
class PdfJsonFontType3GlyphTest {

    @Test
    @DisplayName("no-arg constructor yields null fields")
    void noArg() {
        PdfJsonFontType3Glyph g = new PdfJsonFontType3Glyph();
        assertThat(g.getCharCode()).isNull();
        assertThat(g.getGlyphName()).isNull();
        assertThat(g.getUnicode()).isNull();
        assertThat(g.getCharCodeRaw()).isNull();
    }

    @Test
    @DisplayName("all-args constructor sets every field")
    void allArgs() {
        PdfJsonFontType3Glyph g = new PdfJsonFontType3Glyph(65, "A", 0x41, 200);
        assertThat(g.getCharCode()).isEqualTo(65);
        assertThat(g.getGlyphName()).isEqualTo("A");
        assertThat(g.getUnicode()).isEqualTo(0x41);
        assertThat(g.getCharCodeRaw()).isEqualTo(200);
    }

    @Test
    @DisplayName("builder and setters round-trip")
    void builderAndSetters() {
        PdfJsonFontType3Glyph g =
                PdfJsonFontType3Glyph.builder().charCode(66).glyphName("B").unicode(0x42).build();
        assertThat(g.getCharCode()).isEqualTo(66);
        assertThat(g.getGlyphName()).isEqualTo("B");
        assertThat(g.getUnicode()).isEqualTo(0x42);

        g.setCharCodeRaw(10);
        assertThat(g.getCharCodeRaw()).isEqualTo(10);
    }

    @Test
    @DisplayName("equals/hashCode/toString")
    void equality() {
        PdfJsonFontType3Glyph a = PdfJsonFontType3Glyph.builder().glyphName("A").build();
        PdfJsonFontType3Glyph b = PdfJsonFontType3Glyph.builder().glyphName("A").build();
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);

        PdfJsonFontType3Glyph c = PdfJsonFontType3Glyph.builder().glyphName("B").build();
        assertThat(a).isNotEqualTo(c).isNotEqualTo(null).isNotEqualTo("string");
        assertThat(a.toString()).contains("PdfJsonFontType3Glyph");
    }
}
