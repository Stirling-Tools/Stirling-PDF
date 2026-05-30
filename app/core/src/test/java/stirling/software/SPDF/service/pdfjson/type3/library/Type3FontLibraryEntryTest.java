package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.Test;

class Type3FontLibraryEntryTest {

    @Test
    void hasAnyPayload_noPayloads_returnsFalse() {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder().id("test").label("Test").build();
        assertFalse(entry.hasAnyPayload());
    }

    @Test
    void hasAnyPayload_withProgram_returnsTrue() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder().id("test").label("Test").program(payload).build();
        assertTrue(entry.hasAnyPayload());
    }

    @Test
    void hasAnyPayload_withWebProgram_returnsTrue() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "woff2");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .webProgram(payload)
                        .build();
        assertTrue(entry.hasAnyPayload());
    }

    @Test
    void hasAnyPayload_withPdfProgram_returnsTrue() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "otf");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .pdfProgram(payload)
                        .build();
        assertTrue(entry.hasAnyPayload());
    }

    @Test
    void hasAnyPayload_blankBase64_returnsFalse() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("  ", "ttf");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder().id("test").label("Test").program(payload).build();
        assertFalse(entry.hasAnyPayload());
    }

    @Test
    void builder_signatures() {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .signature("sha256:abc")
                        .signature("sha256:def")
                        .build();
        assertEquals(2, entry.getSignatures().size());
        assertEquals("sha256:abc", entry.getSignatures().get(0));
    }

    @Test
    void builder_aliases() {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .alias("TimesNewRoman")
                        .alias("ABCDEF+TimesNewRoman")
                        .build();
        assertEquals(2, entry.getAliases().size());
    }

    @Test
    void builder_glyphCoverage() {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .glyphCode(65)
                        .glyphCode(66)
                        .glyphCode(67)
                        .build();
        assertEquals(List.of(65, 66, 67), entry.getGlyphCoverage());
    }

    @Test
    void builder_emptyCollections() {
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder().id("test").label("Test").build();
        assertNotNull(entry.getSignatures());
        assertTrue(entry.getSignatures().isEmpty());
        assertNotNull(entry.getAliases());
        assertTrue(entry.getAliases().isEmpty());
        assertNotNull(entry.getGlyphCoverage());
        assertTrue(entry.getGlyphCoverage().isEmpty());
    }

    @Test
    void valueSemantics() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryEntry a =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .program(payload)
                        .source("manual")
                        .build();
        Type3FontLibraryEntry b =
                Type3FontLibraryEntry.builder()
                        .id("test")
                        .label("Test")
                        .program(payload)
                        .source("manual")
                        .build();
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }
}
