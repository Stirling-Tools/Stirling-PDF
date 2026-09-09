package stirling.software.proprietary.integration.api;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;

/**
 * Validates a result URL an external API asked us to fetch.
 *
 * <p>This is the most dangerous input in the whole feature and deserves saying plainly: unlike a
 * step's {@code path}, which an operator wrote, this URL is <em>chosen by the remote service at run
 * time</em>. Fetching whatever it names would hand any integration - or anything that has
 * compromised, spoofed, or MITM'd one - a server-side GET of its choosing, i.e. the cloud metadata
 * service. {@link ExternalApiPaths} cannot help here: the whole point of a result URL is that it
 * usually lives on a different host (a CDN or presigned object store), so "must be under the base
 * URL" would reject the normal case.
 *
 * <p>The rule is therefore an <em>operator-declared</em> allowlist: a result may come from the
 * connection's own host, or from a host named in the connection's {@code resultUrlHosts}. The
 * decision of which hosts are legitimate stays with whoever configured the connection, and never
 * with the response.
 */
final class ResultUrls {

    private ResultUrls() {}

    /**
     * @param url exactly as the API returned it
     * @return the URL to fetch
     * @throws IllegalArgumentException if the response named a host the operator did not authorise
     */
    static URI validate(
            ApiConnectionSettings settings,
            String url,
            ApplicationProperties applicationProperties) {
        URI uri;
        try {
            uri = new URI(url.trim());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException(
                    "The API returned a result URL that is not a valid URL: " + url, e);
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            // file:, gopher:, jar: and friends are how a URL fetch becomes a local file read.
            throw new IllegalArgumentException(
                    "The API returned a result URL that is not http(s): " + url);
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException(
                    "The API returned a result URL with no host: " + url);
        }
        if (uri.getUserInfo() != null) {
            // Credentials in a URL are also the classic way to make a host look like another one.
            throw new IllegalArgumentException(
                    "The API returned a result URL carrying credentials, which is not accepted");
        }

        if (!isAllowedHost(settings, host)) {
            throw new IllegalArgumentException(
                    "The API returned a result URL on '"
                            + host
                            + "', which this connection does not allow. Add it to the connection's"
                            + " 'resultUrlHosts' if results are meant to come from there.");
        }
        // Even an allowlisted name must not resolve somewhere internal: a hostile or compromised
        // DNS record for cdn.vendor.example pointing at 169.254.169.254 would otherwise be obeyed.
        try {
            S3Clients.validateEndpointHost(
                    uri,
                    applicationProperties.getPolicies().isAllowPrivateApiEndpoints(),
                    "API result URL",
                    "set policies.allowPrivateApiEndpoints=true to opt in (e.g. for an on-prem"
                            + " integration).");
        } catch (IllegalStateException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
        return uri;
    }

    /**
     * The connection's own host is implicitly allowed; anything else must be declared.
     *
     * <p>Package-private so the matching rule can be tested without a DNS lookup: {@link #validate}
     * additionally resolves the host, which fails closed and so cannot run against example hosts.
     */
    static boolean isAllowedHost(ApiConnectionSettings settings, String host) {
        String candidate = host.toLowerCase(Locale.ROOT);
        if (candidate.equalsIgnoreCase(settings.baseUri().getHost())) {
            return true;
        }
        Set<String> allowed = settings.resultUrlHosts();
        for (String entry : allowed) {
            String allowedHost = entry.toLowerCase(Locale.ROOT);
            // An exact host, or a subdomain of it. Not a bare suffix match: "evilvendor.com"
            // must not be admitted by an entry of "vendor.com".
            if (candidate.equals(allowedHost) || candidate.endsWith("." + allowedHost)) {
                return true;
            }
        }
        return false;
    }
}
