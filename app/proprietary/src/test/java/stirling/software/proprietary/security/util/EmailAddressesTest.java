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
        assertFalse(EmailAddresses.isValidAccountAddress(value));
        assertFalse(EmailAddresses.hasDeliverableShape(value));
    }

    @Test
    void rejectsNull() {
        assertFalse(EmailAddresses.isValidAccountAddress(null));
        assertFalse(EmailAddresses.hasDeliverableShape(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"a@b.co", "first.last+tag@sub.example.co.uk", "  a@b.com  "})
    void acceptsAddressesWithARealDomain(String value) {
        assertTrue(EmailAddresses.isValidAccountAddress(value));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "a!b@ex.com",
                "o'brien@example.com",
                "a<b>@ex.com",
                "a\"b@ex.com",
                "a@-ex.com",
                "a@ex..com",
                "a@ex.com.",
                "-a@ex.com",
                "a@[192.168.0.1]",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                        + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@ex.com"
            })
    void refusesWhatTheAccountWriterWouldRefuse(String value) {
        assertTrue(EmailAddresses.hasDeliverableShape(value));
        assertFalse(UsernameRules.isValid(value.trim()));
        assertFalse(EmailAddresses.isValidAccountAddress(value));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "a@b.co",
                "first.last+tag@sub.example.co.uk",
                "  a@b.com  ",
                "a!b@ex.com",
                "o'brien@example.com",
                "a@ex..com",
                "-a@ex.com",
                "admin@localhost",
                "a@b",
                "a@"
            })
    void everythingAcceptedCanBecomeAnAccount(String value) {
        if (EmailAddresses.isValidAccountAddress(value)) {
            assertTrue(UsernameRules.isValid(value.trim()));
        }
    }

    @Test
    void refusesSingleLabelMailDomainsEvenThoughAnAccountCouldHoldThem() {
        assertTrue(UsernameRules.isValid("admin@localhost"));
        assertFalse(EmailAddresses.isValidAccountAddress("admin@localhost"));
    }
}
