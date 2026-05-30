package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class Type3FontLibraryMatchTest {

    @Test
    void builder_allFields() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryEntry entry =
                Type3FontLibraryEntry.builder()
                        .id("entry1")
                        .label("Entry 1")
                        .program(payload)
                        .build();
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature("sha256:abc123")
                        .build();

        assertSame(entry, match.getEntry());
        assertEquals("signature", match.getMatchType());
        assertEquals("sha256:abc123", match.getSignature());
    }

    @Test
    void builder_nullEntry() {
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(null)
                        .matchType("alias:test")
                        .signature(null)
                        .build();

        assertNull(match.getEntry());
        assertEquals("alias:test", match.getMatchType());
        assertNull(match.getSignature());
    }

    @Test
    void valueSemantics() {
        Type3FontLibraryEntry entry = Type3FontLibraryEntry.builder().id("e1").label("E1").build();
        Type3FontLibraryMatch a =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature("sha256:abc")
                        .build();
        Type3FontLibraryMatch b =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature("sha256:abc")
                        .build();
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void toString_containsFields() {
        Type3FontLibraryEntry entry = Type3FontLibraryEntry.builder().id("e1").label("E1").build();
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature("sha256:abc")
                        .build();
        String str = match.toString();
        assertTrue(str.contains("signature"));
        assertTrue(str.contains("sha256:abc"));
    }

    @Test
    void builder_aliasMatchType() {
        Type3FontLibraryEntry entry = Type3FontLibraryEntry.builder().id("e2").label("E2").build();
        Type3FontLibraryMatch match =
                Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("alias:timesnewroman")
                        .signature("sha256:def456")
                        .build();

        assertEquals("alias:timesnewroman", match.getMatchType());
    }
}
