package stirling.software.proprietary.security.model.exception;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class NoProviderFoundExceptionTest {

    @Test
    void constructor_setsMessage_withoutCause() {
        NoProviderFoundException ex = new NoProviderFoundException("no provider");
        assertEquals("no provider", ex.getMessage());
        assertNull(ex.getCause(), "Cause should be null for single-arg constructor");
    }

    @Test
    void constructor_setsMessage_andCause() {
        Throwable cause = new IllegalStateException("root");
        NoProviderFoundException ex = new NoProviderFoundException("missing", cause);

        assertEquals("missing", ex.getMessage());
        assertSame(cause, ex.getCause());
    }

    @Test
    void canBeThrownAndCaught_checkedException() {
        try {
            throw new NoProviderFoundException("boom");
        } catch (NoProviderFoundException ex) {
            assertEquals("boom", ex.getMessage());
        }
    }
}
