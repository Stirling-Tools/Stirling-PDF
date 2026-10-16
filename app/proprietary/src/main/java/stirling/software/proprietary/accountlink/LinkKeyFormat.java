package stirling.software.proprietary.accountlink;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Wire format of an account-link key, shared by Stirling Cloud (which issues and redeems keys) and
 * the self-hosted server (which recognises and submits them): {@code stlk_<keyId>.<secret>}.
 *
 * <p>Both halves are unpadded base64url, whose alphabet has no {@code .}, so the split is
 * unambiguous. The key id is public and safe to log; only the secret is sensitive. Whitespace is
 * ignored when parsing so a key that wrapped in an email or carries a trailing newline from an
 * environment file still reads.
 */
public final class LinkKeyFormat {

    public static final String PREFIX = "stlk_";

    static final int KEY_ID_BYTES = 16;
    static final int SECRET_BYTES = 32;

    private static final Pattern BODY =
            Pattern.compile("^([A-Za-z0-9_-]{22})\\.([A-Za-z0-9_-]{43})$");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private LinkKeyFormat() {}

    public record Parts(String keyId, String secret) {
        public String compose() {
            return PREFIX + keyId + "." + secret;
        }

        /** Never prints the secret. */
        @Override
        public String toString() {
            return "LinkKey[" + keyId + "]";
        }
    }

    public static Parts generate(SecureRandom random) {
        return new Parts(randomUrlSafe(random, KEY_ID_BYTES), randomUrlSafe(random, SECRET_BYTES));
    }

    /** Whether the input is meant to be a link key, well formed or not. */
    public static boolean looksLikeLinkKey(String raw) {
        return raw != null && raw.strip().startsWith(PREFIX);
    }

    public static Optional<Parts> parse(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String compact = WHITESPACE.matcher(raw).replaceAll("");
        if (!compact.startsWith(PREFIX)) {
            return Optional.empty();
        }
        var matcher = BODY.matcher(compact.substring(PREFIX.length()));
        if (!matcher.matches()) {
            return Optional.empty();
        }
        return Optional.of(new Parts(matcher.group(1), matcher.group(2)));
    }

    private static String randomUrlSafe(SecureRandom random, int bytes) {
        byte[] buf = new byte[bytes];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
