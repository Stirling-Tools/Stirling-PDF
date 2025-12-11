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
    void extendsRuntimeExceptionDirectly() {
        assertEquals(
                RuntimeException.class,
                BackupNotFoundException.class.getSuperclass(),
                "BackupNotFoundException should extend RuntimeException directly");
    }

    @Test
    void canBeThrownAndCaught() {
        BackupNotFoundException ex =
                assertThrows(
                        BackupNotFoundException.class,
                        () -> {
                            throw new BackupNotFoundException("missing backup");
                        });
        assertEquals("missing backup", ex.getMessage());
    }
}
