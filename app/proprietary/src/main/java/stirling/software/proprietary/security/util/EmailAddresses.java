package stirling.software.proprietary.security.util;

import java.util.regex.Pattern;

/**
 * The shape an address must have to be worth mailing, and the stricter shape it must have to also
 * become an account. Deliberately structural, not deliverable: full RFC 5322 buys nothing here, and
 * only a sent message proves an address exists.
 */
public final class EmailAddresses {

    /** Requires a domain with a 2-character-or-longer TLD; rejects "a@" and "a@b". */
    private static final Pattern PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");

    private EmailAddresses() {}

    /** Whether the address is worth handing to a mail server. Says nothing about account rules. */
    public static boolean hasDeliverableShape(String value) {
        return value != null && PATTERN.matcher(value.trim()).matches();
    }

    /**
     * Whether an account may be created for this address. Both halves are load-bearing: the shape
     * keeps undeliverable invites from being minted, and {@link UsernameRules} is what {@code
     * saveUserCore} enforces, so accepting an address it rejects turns into a failure at redemption
     * rather than at the request that offered it.
     */
    public static boolean isValidAccountAddress(String value) {
        return hasDeliverableShape(value) && UsernameRules.isValid(value.trim());
    }
}
