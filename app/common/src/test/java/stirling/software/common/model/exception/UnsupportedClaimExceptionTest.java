package stirling.software.common.model.exception;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Tests for UnsupportedClaimException")
class UnsupportedClaimExceptionTest {

    @Test
    @DisplayName("should store message passed to constructor")
    void shouldStoreMessageFromConstructor() {
        String expectedMessage = "This claim is not supported";
        UnsupportedClaimException exception = new UnsupportedClaimException(expectedMessage);

        // Verify the stored message
        assertEquals(
                expectedMessage,
                exception.getMessage(),
                "Constructor should correctly store the provided message");
    }

    @Test
    @DisplayName("should allow null message without throwing exception")
    void shouldAllowNullMessage() {
        UnsupportedClaimException exception = new UnsupportedClaimException(null);

        // Null message should be stored as null
        assertNull(
                exception.getMessage(),
                "Constructor should accept null message and store it as null");
    }
}
