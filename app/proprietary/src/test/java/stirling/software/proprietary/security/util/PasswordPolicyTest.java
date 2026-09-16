package stirling.software.proprietary.security.util;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PasswordPolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {"", "x", "short", "seven77"})
    void rejectsAnythingBelowTheMinimum(String password) {
        assertFalse(PasswordPolicy.isAcceptable(password));
    }

    @Test
    void rejectsNull() {
        assertFalse(PasswordPolicy.isAcceptable(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"eight888", "a much longer passphrase"})
    void acceptsTheMinimumAndAbove(String password) {
        assertTrue(PasswordPolicy.isAcceptable(password));
    }

    @Test
    void rejectsAnAllWhitespaceSecretThatIsLongEnough() {
        assertFalse(PasswordPolicy.isAcceptable("          "));
    }
}
