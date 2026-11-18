package stirling.software.saas.store;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Public identifiers for listings. A store id is {@code sp-} plus eight characters from the
 * Crockford base32 alphabet (no i, l, o or u, so it survives being read aloud or retyped); 40 bits
 * of entropy is plenty for a catalogue and short enough to quote. The slug is cosmetic: URLs carry
 * it for readability, lookups never use it.
 */
public final class StoreIds {

    public static final String PREFIX = "sp-";
    static final String ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
    static final int LENGTH = 8;
    static final Pattern STORE_ID = Pattern.compile("^sp-[" + ALPHABET + "]{" + LENGTH + "}$");

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern NON_SLUG = Pattern.compile("[^a-z0-9]+");

    private StoreIds() {}

    public static String newStoreId() {
        StringBuilder sb = new StringBuilder(PREFIX);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    public static boolean isStoreId(String value) {
        return value != null && STORE_ID.matcher(value).matches();
    }

    /** "Invoice intake cleanup" becomes "invoice-intake-cleanup"; never empty, at most 60 chars. */
    public static String slugify(String name) {
        String ascii =
                Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFKD)
                        .replaceAll("\\p{M}+", "")
                        .toLowerCase(Locale.ROOT);
        String slug = NON_SLUG.matcher(ascii).replaceAll("-").replaceAll("^-+|-+$", "");
        if (slug.length() > 60) {
            slug = slug.substring(0, 60).replaceAll("-+$", "");
        }
        return slug.isEmpty() ? "pipeline" : slug;
    }
}
