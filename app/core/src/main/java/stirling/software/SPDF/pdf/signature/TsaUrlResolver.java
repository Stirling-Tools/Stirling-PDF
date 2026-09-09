package stirling.software.SPDF.pdf.signature;

import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

/**
 * Resolves and validates RFC 3161 Time Stamp Authority (TSA) URLs against an allowlist, shared by
 * every feature that can embed a TSA timestamp (standalone timestamping, certificate signing).
 *
 * <p>A TSA URL is never trusted as-is: {@link stirling.software.SPDF.pdf.signature.TSAClient} opens
 * a raw HTTP connection to whatever URL it is given, so accepting an arbitrary URL here would let a
 * caller turn the server into an SSRF proxy. Only the built-in presets and the admin-configured
 * URLs in {@code security.timestamp} are ever allowed.
 */
@Component
@RequiredArgsConstructor
public class TsaUrlResolver {

    /** Built-in TSA presets with labels — single source of truth for backend + frontend. */
    public static final List<Map<String, String>> TSA_PRESETS =
            List.of(
                    Map.of("label", "DigiCert", "url", "http://timestamp.digicert.com"),
                    Map.of("label", "Sectigo", "url", "http://timestamp.sectigo.com"),
                    Map.of("label", "SSL.com", "url", "http://ts.ssl.com"),
                    Map.of("label", "FreeTSA", "url", "https://freetsa.org/tsr"),
                    Map.of("label", "MeSign", "url", "http://tsa.mesign.com"));

    private static final Set<String> ALLOWED_TSA_PRESET_URLS =
            TSA_PRESETS.stream().map(p -> p.get("url")).collect(Collectors.toUnmodifiableSet());

    private final ApplicationProperties applicationProperties;

    /**
     * Resolves the effective TSA URL for a request and validates it against the allowlist.
     *
     * @param requestedUrl the URL the caller asked for, or null/blank to use the admin default
     * @return the validated URL to use
     * @throws IllegalArgumentException if the resolved URL is not in the allowlist
     */
    public String resolve(String requestedUrl) {
        ApplicationProperties.Security.Timestamp tsConfig =
                applicationProperties.getSecurity().getTimestamp();

        String tsaUrl =
                (requestedUrl != null && !requestedUrl.isBlank())
                        ? requestedUrl.trim()
                        : tsConfig.getDefaultTsaUrl();

        if (tsaUrl == null || tsaUrl.isBlank()) {
            throw new IllegalArgumentException(
                    "No default TSA URL is configured (security.timestamp.defaultTsaUrl)."
                            + " Contact your administrator to configure one.");
        }

        if (!isValidTsaUrlProtocol(tsaUrl)) {
            throw new IllegalArgumentException("TSA URL must start with http:// or https://");
        }

        Set<String> normalizedAllowed =
                allowedUrls(tsConfig).stream().map(TsaUrlResolver::normalize).collect(Collectors.toSet());

        if (!normalizedAllowed.contains(normalize(tsaUrl))) {
            throw new IllegalArgumentException(
                    "TSA URL is not in the allowed list. Contact your administrator to add it"
                            + " via settings.yml (security.timestamp.defaultTsaUrl or security.timestamp.customTsaUrls)."
                            );
        }

        return tsaUrl;
    }

    /** Resolves the admin-configured default TSA URL, validated against the allowlist. */
    public String resolveDefault() {
        return resolve(null);
    }

    private static Set<String> allowedUrls(ApplicationProperties.Security.Timestamp tsConfig) {
        Set<String> allowedUrls = new HashSet<>(ALLOWED_TSA_PRESET_URLS);

        String defaultTsaUrl = tsConfig.getDefaultTsaUrl();
        if (defaultTsaUrl != null
                && !defaultTsaUrl.isBlank()
                && isValidTsaUrlProtocol(defaultTsaUrl)) {
            allowedUrls.add(defaultTsaUrl);
        }

        List<String> customUrls = tsConfig.getCustomTsaUrls();
        if (customUrls != null) {
            customUrls.stream()
                    .filter(u -> u != null && !u.isBlank() && isValidTsaUrlProtocol(u))
                    .forEach(allowedUrls::add);
        }

        return allowedUrls;
    }

    private static boolean isValidTsaUrlProtocol(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private static String normalize(String url) {
        try {
            URI uri = URI.create(url.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            String path = uri.getPath() == null ? "" : uri.getPath();
            return scheme + "://" + host + (port == -1 ? "" : ":" + port) + path;
        } catch (Exception e) {
            return url == null ? "" : url.toLowerCase(Locale.ROOT);
        }
    }
}
