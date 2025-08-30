package stirling.software.proprietary.security.model.exception;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class BackupNotFoundExceptionTest {

    @Test
    void constructor_setsMessage() {
        BackupNotFoundException ex = new BackupNotFoundException("not found");
        assertEquals("not found", ex.getMessage());
        assertNull(ex.getCause(), "No cause expected for single-arg constructor");
    }

    @Test
    void isRuntimeException() {
        BackupNotFoundException ex = new BackupNotFoundException("x");
        assertTrue(ex instanceof RuntimeException, "Should extend RuntimeException");
    }

    @Test
    void canBeThrownAndCaught() {
        try {
            throw new BackupNotFoundException("missing backup");
        } catch (BackupNotFoundException ex) {
            assertEquals("missing backup", ex.getMessage());
        }
    }
}
