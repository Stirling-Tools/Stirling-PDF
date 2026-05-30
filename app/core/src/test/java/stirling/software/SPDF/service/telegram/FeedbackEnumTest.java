package stirling.software.SPDF.service.telegram;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class FeedbackEnumTest {

    @Test
    void allExpectedValuesExist() {
        FeedbackEnum[] values = FeedbackEnum.values();
        assertEquals(4, values.length);
        assertNotNull(FeedbackEnum.valueOf("NO_VALID_DOCUMENT"));
        assertNotNull(FeedbackEnum.valueOf("ERROR_MESSAGE"));
        assertNotNull(FeedbackEnum.valueOf("ERROR_PROCESSING"));
        assertNotNull(FeedbackEnum.valueOf("PROCESSING"));
    }

    @Test
    void valueOfThrowsForInvalidName() {
        assertThrows(IllegalArgumentException.class, () -> FeedbackEnum.valueOf("UNKNOWN"));
    }
}
