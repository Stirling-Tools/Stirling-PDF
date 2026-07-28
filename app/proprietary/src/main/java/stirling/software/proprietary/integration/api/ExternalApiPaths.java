package stirling.software.proprietary.integration.api;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * Resolves a step-supplied relative path under a connection's operator-set base URL.
 *
 * <p>This is the control that keeps the external-API step from being an SSRF primitive. The base
 * URL comes from an {@code IntegrationConfig} only someone with manage rights can edit; the path
 * comes from a pipeline step, which is a far weaker trust boundary. Everything here exists to
 * guarantee that a path can address a resource <em>under</em> the base and nothing else.
 *
 * <p>{@link URI#resolve} is deliberately not used: resolving the protocol-relative {@code
 * //evil.example} against {@code https://api.example.com/v1} yields {@code https://evil.example},
 * silently changing host. Instead the path is screened, appended textually, normalised, and then
 * the result is re-checked against the base - so a miss in the screen is still caught by the check.
 */
public final class ExternalApiPaths {

    private ExternalApiPaths() {}

    /**
     * @param base the connection's base URL, already validated as http(s) with a host
     * @param path a relative path, optionally with a query string; blank means the base itself
     * @throws IllegalArgumentException if the path is absolute, escapes the base, or carries
     *     characters that could split the request line
     */
    public static URI resolve(URI base, String path) {
        if (path == null || path.isBlank()) {
            return base;
        }
        String candidate = path.trim();
        screen(candidate);

        if (!candidate.startsWith("/")) {
            candidate = "/" + candidate;
        }

        URI resolved;
        try {
            resolved = new URI(base + candidate).normalize();
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException(
                    "api step 'path' is not a valid URL path: " + path, e);
        }
        requireSameOrigin(base, resolved, path);
        requireUnderBasePath(base, resolved, path);
        return resolved;
    }

    /** Reject the shapes that could retarget the request before it is even assembled. */
    private static void screen(String path) {
        if (path.contains("://") || path.startsWith("//")) {
            throw new IllegalArgumentException(
                    "api step 'path' must be relative to the connection's base URL, not an"
                            + " absolute or protocol-relative URL: "
                            + path);
        }
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            // Control characters and spaces can split the request line; a backslash is normalised
            // to '/' by some servers and would sidestep the traversal check below.
            if (c <= 0x20 || c == 0x7F || c == '\\') {
                throw new IllegalArgumentException(
                        "api step 'path' contains an illegal character: " + path);
            }
        }
        if (path.indexOf('#') >= 0) {
            throw new IllegalArgumentException(
                    "api step 'path' must not contain a fragment: " + path);
        }
        // Percent-encoded dots would survive the normalise() below and be decoded by the target, so
        // a traversal must not be smuggled past us in encoded form.
        //
        // Only dots are rejected. An encoded slash or backslash is legitimate: Placeholders encodes
        // substituted values, so a filename containing '/' arrives here as %2F, where it is data
        // inside one segment rather than structure. Rejecting those would refuse ordinary filenames
        // while doing nothing for traversal, which needs the dots.
        String lower = path.toLowerCase(Locale.ROOT);
        if (lower.contains("%2e")) {
            throw new IllegalArgumentException(
                    "api step 'path' must not percent-encode dots: " + path);
        }
    }

    private static void requireSameOrigin(URI base, URI resolved, String original) {
        boolean sameOrigin =
                equalsIgnoreCase(base.getScheme(), resolved.getScheme())
                        && equalsIgnoreCase(base.getHost(), resolved.getHost())
                        && base.getPort() == resolved.getPort()
                        && resolved.getUserInfo() == null;
        if (!sameOrigin) {
            throw new IllegalArgumentException(
                    "api step 'path' would change the target host; it must stay under the"
                            + " connection's base URL: "
                            + original);
        }
    }

    private static void requireUnderBasePath(URI base, URI resolved, String original) {
        String basePath = base.getPath() == null ? "" : base.getPath();
        String resolvedPath = resolved.getPath() == null ? "" : resolved.getPath();
        // The base URL has its trailing slash stripped at parse time, so a base path of "/v1"
        // must match "/v1" exactly or be followed by a separator - never "/v1betray".
        boolean under =
                basePath.isEmpty()
                        || resolvedPath.equals(basePath)
                        || resolvedPath.startsWith(basePath + "/");
        if (!under) {
            throw new IllegalArgumentException(
                    "api step 'path' escapes the connection's base path: " + original);
        }
    }

    private static boolean equalsIgnoreCase(String a, String b) {
        return a == null ? b == null : a.equalsIgnoreCase(b);
    }
}
