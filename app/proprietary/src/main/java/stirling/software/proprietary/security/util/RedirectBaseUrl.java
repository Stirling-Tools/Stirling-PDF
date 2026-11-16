package stirling.software.proprietary.security.util;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** Parses the opt-in {@code redirectBaseUrl} settings: public URLs that replace {baseUrl}. */
public final class RedirectBaseUrl {

    private static final Pattern TRAILING_SLASHES = Pattern.compile("/+$");

    private RedirectBaseUrl() {}

    /** Empty when unset or not an absolute http(s) URL without query, fragment or user info. */
    public static Optional<String> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String trimmed = TRAILING_SLASHES.matcher(value.trim()).replaceAll("");
        try {
            URI uri = new URI(trimmed);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            boolean valid =
                    ("http".equals(scheme) || "https".equals(scheme))
                            && uri.getHost() != null
                            && uri.getRawUserInfo() == null
                            && uri.getRawQuery() == null
                            && uri.getRawFragment() == null;
            return valid ? Optional.of(trimmed) : Optional.empty();
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
    }

    /** Scheme and authority of a URL, e.g. {@code https://pdf.example.com}. */
    public static Optional<String> origin(String value) {
        return parse(value)
                .map(URI::create)
                .map(uri -> uri.getScheme() + "://" + uri.getRawAuthority());
    }

    /** Override first, then a non-blank fallback setting with trailing slashes removed. */
    public static Optional<String> overrideOr(String override, String fallback) {
        return parse(override)
                .or(
                        () ->
                                Optional.ofNullable(fallback)
                                        .map(String::trim)
                                        .filter(value -> !value.isEmpty())
                                        .map(
                                                value ->
                                                        TRAILING_SLASHES
                                                                .matcher(value)
                                                                .replaceAll("")));
    }

    /**
     * Where users land after login or logout once an override is set: the frontend URL when the UI
     * is hosted apart from the backend, else the override. Empty when no override is set.
     */
    public static Optional<String> landingBase(String override, String frontendUrl) {
        return parse(override).map(base -> parse(frontendUrl).orElse(base));
    }
}
