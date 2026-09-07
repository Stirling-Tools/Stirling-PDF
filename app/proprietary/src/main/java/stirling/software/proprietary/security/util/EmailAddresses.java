package stirling.software.proprietary.security.util;

import java.util.regex.Pattern;

/**
 * The shape an address must have before it is accepted as a future account's username. Deliberately
 * structural, not deliverable: full RFC 5322 buys nothing here, and only a sent message proves an
 * address exists.
 */
public final class EmailAddresses {

    /** Requires a domain with a 2-character-or-longer TLD; rejects "a@" and "a@b". */
    private static final Pattern PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    private EmailAddresses() {}

    public static boolean isValid(String value) {
        return value != null && PATTERN.matcher(value.trim()).matches();
    }
}
