package stirling.software.SPDF.service.pdfjson.type3.library;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

class Type3FontLibraryPayloadTest {

    @Test
    void hasPayload_validBase64_returnsTrue() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload("AQID", "ttf");
        assertTrue(payload.hasPayload());
    }

    @Test
    void hasPayload_nullBase64_returnsFalse() {
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload((String) null, "ttf");
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
    void getBase64_ioFailure_cooldownsThenRetries() throws Exception {
        Resource resource = mock(Resource.class);
        when(resource.getDescription()).thenReturn("test-resource");
        when(resource.getInputStream())
                .thenThrow(new IOException("first read"))
                .thenReturn(new ByteArrayInputStream(new byte[] {1, 2, 3}));
        Type3FontLibraryPayload payload = new Type3FontLibraryPayload(resource, "ttf");

        assertNull(payload.getBase64());
        assertNull(payload.getBase64());
        verify(resource, times(1)).getInputStream();

        java.lang.reflect.Field retryAfterNanos =
                Type3FontLibraryPayload.class.getDeclaredField("retryAfterNanos");
        retryAfterNanos.setAccessible(true);
        retryAfterNanos.setLong(payload, 0);

        assertEquals("AQID", payload.getBase64());
        verify(resource, times(2)).getInputStream();
    }

    @Test
    void valueSemantics_different() {
        Type3FontLibraryPayload a = new Type3FontLibraryPayload("AQID", "ttf");
        Type3FontLibraryPayload b = new Type3FontLibraryPayload("BAMC", "ttf");
        assertNotEquals(a, b);
    }
}
