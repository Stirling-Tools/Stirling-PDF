package stirling.software.proprietary.security.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EmailAddressesTest {

    @ParameterizedTest
    @ValueSource(strings = {"a@", "@example.com", "a@b", "a@b.c", "no-at-sign", "a b@ex.com", ""})
    void rejectsAddressesThatCouldNotBeDelivered(String value) {
        assertFalse(EmailAddresses.isValid(value));
    }

    @Test
    void rejectsNull() {
        assertFalse(EmailAddresses.isValid(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"a@b.co", "first.last+tag@sub.example.co.uk", "  a@b.com  "})
    void acceptsAddressesWithARealDomain(String value) {
        assertTrue(EmailAddresses.isValid(value));
    }
}
