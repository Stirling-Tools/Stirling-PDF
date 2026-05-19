package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class Type3FontLibraryPayloadTest {

    @Test
    void hasPayload_validBase64_returnsTrue() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        assertTrue(payload.hasPayload());
    }

    @Test
    void hasPayload_nullBase64_returnsFalse() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload(null, "ttf");
        assertFalse(payload.hasPayload());
    }

    @Test
    void hasPayload_emptyBase64_returnsFalse() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("", "ttf");
        assertFalse(payload.hasPayload());
    }

    @Test
    void hasPayload_blankBase64_returnsFalse() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("   ", "ttf");
        assertFalse(payload.hasPayload());
    }

    @Test
    void getters() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "woff2");
        assertEquals("AQID", payload.getBase64());
        assertEquals("woff2", payload.getFormat());
    }

    @Test
    void nullFormat() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", null);
        assertTrue(payload.hasPayload());
        assertNull(payload.getFormat());
    }

    @Test
    void valueSemantics() {
        Type3FontLibraryPayload a = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryPayload b = new Type3FontLibraryPayload("AQID", "ttf");
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void valueSemantics_different() {
        Type3FontLibraryPayload a = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryPayload b = new Type3FontLibraryPayload("BAMC", "ttf");
        assertNotEquals(a, b);
    }
}
