package stirling.software.proprietary.integration.api;

import java.util.Locale;
import java.util.Set;

/**
 * Validation for operator-supplied HTTP header names and values.
 *
 * <p>Header values reach the wire verbatim, so a value carrying CR/LF could splice extra headers -
 * or a whole second request - into the stream. Names and values are therefore checked against the
 * RFC 7230 grammar rather than trusted.
 */
public final class ExternalApiHeaders {

    /**
     * Headers a connection may not set as a static header. Authentication has exactly one path
     * ({@code authType} + {@code token}) so credentials cannot be smuggled in as a "static" header
     * that bypasses the auth validation; the rest are framing headers owned by the HTTP client,
     * where a caller-set value would contradict the body actually sent.
     */
    private static final Set<String> RESERVED =
            Set.of(
                    "authorization",
                    "proxy-authorization",
                    "host",
                    "content-length",
                    "transfer-encoding",
                    "connection",
                    "upgrade",
                    "expect");

    private ExternalApiHeaders() {}

    /** RFC 7230 {@code token}: the only characters legal in a header name. */
    public static boolean isValidName(String name) {
        if (name == null || name.isEmpty()) {
            return false;
        }
        for (int i = 0; i < name.length(); i++) {
            if (!isTokenChar(name.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    /** Visible ASCII, space and horizontal tab. Excludes CR/LF and NUL, which would inject. */
    public static boolean isValidValue(String value) {
        if (value == null) {
            return false;
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean printable = c >= 0x20 && c <= 0x7E;
            if (!printable && c != '\t') {
                return false;
            }
        }
        return true;
    }

    public static boolean isReserved(String name) {
        return name != null && RESERVED.contains(name.toLowerCase(Locale.ROOT));
    }

    private static boolean isTokenChar(char c) {
        return (c >= 'a' && c <= 'z')
                || (c >= 'A' && c <= 'Z')
                || (c >= '0' && c <= '9')
                || "!#$%&'*+-.^_`|~".indexOf(c) >= 0;
    }
}
