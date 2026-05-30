package stirling.software.SPDF.exception;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class CacheUnavailableExceptionTest {

    @Test
    void constructor_sets_message() {
        CacheUnavailableException ex = new CacheUnavailableException("cache down");
        assertEquals("cache down", ex.getMessage());
    }

    @Test
    void constructor_with_null_message() {
        CacheUnavailableException ex = new CacheUnavailableException(null);
        assertNull(ex.getMessage());
    }

    @Test
    void constructor_with_empty_message() {
        CacheUnavailableException ex = new CacheUnavailableException("");
        assertEquals("", ex.getMessage());
    }

    @Test
    void extends_RuntimeException() {
        CacheUnavailableException ex = new CacheUnavailableException("test");
        assertInstanceOf(RuntimeException.class, ex);
    }

    @Test
    void is_throwable() {
        CacheUnavailableException ex = new CacheUnavailableException("boom");
        assertThrows(
                CacheUnavailableException.class,
                () -> {
                    throw ex;
                });
    }

    @Test
    void caught_as_RuntimeException() {
        try {
            throw new CacheUnavailableException("cache unavailable");
        } catch (RuntimeException e) {
            assertEquals("cache unavailable", e.getMessage());
            assertInstanceOf(CacheUnavailableException.class, e);
        }
    }

    @Test
    void cause_is_null_by_default() {
        CacheUnavailableException ex = new CacheUnavailableException("no cause");
        assertNull(ex.getCause());
    }

    @Test
    void message_preserved_with_special_characters() {
        String msg = "cache: unavailable! @host=127.0.0.1 (timeout=30s)";
        CacheUnavailableException ex = new CacheUnavailableException(msg);
        assertEquals(msg, ex.getMessage());
    }

    @Test
    void stack_trace_is_populated() {
        CacheUnavailableException ex = new CacheUnavailableException("stack test");
        assertNotNull(ex.getStackTrace());
        assertTrue(ex.getStackTrace().length > 0);
    }

    @Test
    void toString_contains_message() {
        CacheUnavailableException ex = new CacheUnavailableException("down");
        assertTrue(ex.toString().contains("down"));
    }
}
