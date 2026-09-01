package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * A field name is caller-supplied and reaches several loggers. A line break in one would forge a
 * second log line (CWE-117), so names carrying control characters are refused outright.
 */
class FormFieldNameSafetyTest {

    @Test
    void aNameWithCrLfIsRefused() {
        String forged = "evil\r\n2026-01-01 00:00:00 ERROR admin login from 1.2.3.4";
        String reason = FormUtils.invalidFieldNameReason(forged);
        assertNotNull(reason, "a name containing CR/LF must be refused");
        assertFalse(reason.contains("\n"), "the refusal itself must not carry a line break");
        assertFalse(reason.contains("\r"), "the refusal itself must not carry a carriage return");
    }

    @Test
    void otherControlCharactersAreRefusedToo() {
        assertNotNull(FormUtils.invalidFieldNameReason("tab\there"));
        assertNotNull(FormUtils.invalidFieldNameReason("null\u0000byte"));
    }

    @Test
    void ordinaryNamesStillPass() {
        assertNull(FormUtils.invalidFieldNameReason("Full Name"));
        assertNull(FormUtils.invalidFieldNameReason("weird/[]{}"));
        assertNull(FormUtils.invalidFieldNameReason("Mr Smith"));
    }

    @Test
    void thePeriodRefusalDoesNotEchoControlCharacters() {
        // Both problems at once: the period branch must not leak the raw name into a log line.
        String reason = FormUtils.invalidFieldNameReason("Customer.Name\r\nFORGED");
        assertNotNull(reason);
        assertFalse(reason.contains("\r") || reason.contains("\n"), "no raw line break: " + reason);
    }

    @Test
    void sanitizeForLogFlattensControlCharacters() {
        assertEquals("a b", FormUtils.sanitizeForLog("a\nb"));
        assertEquals("a b", FormUtils.sanitizeForLog("a\rb"));
        assertEquals("plain", FormUtils.sanitizeForLog("plain"));
        assertNull(FormUtils.sanitizeForLog(null));
    }

    @Test
    void aPeriodIsStillRefusedWithTheOffendingCharacterNamed() {
        String reason = FormUtils.invalidFieldNameReason("Customer.Name");
        assertNotNull(reason);
        assertTrue(reason.contains("period"), "the message should name the problem: " + reason);
    }
}
