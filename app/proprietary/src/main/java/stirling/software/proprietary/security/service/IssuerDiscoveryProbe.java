package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Checks that an OpenID Connect issuer answers discovery. OAuth sign-in and MCP's OAuth mode both
 * read {@code <issuer>/.well-known/openid-configuration}; an issuer that does not answer stops
 * sign-in from being registered, so the setup wizard checks it before saving.
 *
 * <p>The admin chooses the host, so this is a bounded SSRF surface that only ever answers true or
 * false. Loopback and private hosts are allowed because a self-hosted identity provider usually
 * lives on one. Link-local addresses and the cloud metadata services outside that range are
 * refused, redirects are not followed, and the document is read up to a fixed size. The host is
 * resolved once for that check and again by the client, so a name that changes its answer between
 * the two can still be fetched from; all that tells the caller is whether the address advertised
 * the issuer.
 */
@Service
@Slf4j
public class IssuerDiscoveryProbe {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final String DISCOVERY_PATH = "/.well-known/openid-configuration";
    private static final int MAX_DOCUMENT_BYTES = 256 * 1024; // real documents are a few KB
    private static final Set<InetAddress> METADATA_ADDRESSES = metadataAddresses();

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Autowired
    public IssuerDiscoveryProbe(ObjectMapper objectMapper) {
        this(
                HttpClient.newBuilder()
                        .connectTimeout(TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build(),
                objectMapper);
    }

    IssuerDiscoveryProbe(HttpClient httpClient, ObjectMapper objectMapper) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    /**
     * True when {@code issuer} is an http(s) URL whose discovery document names that same issuer,
     * compared exactly apart from surrounding whitespace: Spring matches the saved value against
     * the advertised one the same way, and some providers (Auth0) advertise a trailing slash. Never
     * throws: an unreachable, slow or malformed issuer is simply false.
     */
    public boolean answersDiscovery(String issuer) {
        if (issuer == null) {
            return false;
        }
        String expectedIssuer = issuer.trim();
        URI discovery;
        try {
            URI base = URI.create(withoutTrailingSlashes(expectedIssuer));
            String scheme =
                    base.getScheme() == null ? "" : base.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https") || base.getHost() == null) {
                return false;
            }
            if (resolvesToRefusedAddress(base.getHost())) {
                return false;
            }
            discovery = URI.create(base + DISCOVERY_PATH);
        } catch (IllegalArgumentException | UnknownHostException e) {
            return false;
        }
        try {
            HttpResponse<InputStream> response =
                    httpClient.send(
                            HttpRequest.newBuilder(discovery).timeout(TIMEOUT).GET().build(),
                            HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                if (response.statusCode() != 200) {
                    return false;
                }
                byte[] document = body.readNBytes(MAX_DOCUMENT_BYTES + 1);
                if (document.length > MAX_DOCUMENT_BYTES) {
                    log.debug("Issuer discovery document too large for {}", discovery);
                    return false;
                }
                JsonNode advertisedIssuer = objectMapper.readTree(document).get("issuer");
                return advertisedIssuer != null
                        && advertisedIssuer.isString()
                        && expectedIssuer.equals(advertisedIssuer.stringValue());
            }
        } catch (IOException e) {
            log.debug("Issuer discovery failed for {}: {}", discovery, e.getMessage());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (RuntimeException e) {
            log.debug("Issuer discovery returned an unreadable document for {}", discovery);
            return false;
        }
    }

    // A loop rather than replaceAll("/+$"), which backtracks on long runs of slashes.
    private static String withoutTrailingSlashes(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') {
            end--;
        }
        return value.substring(0, end);
    }

    private static boolean resolvesToRefusedAddress(String host) throws UnknownHostException {
        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isLinkLocalAddress()
                    || address.isAnyLocalAddress()
                    || address.isMulticastAddress()
                    || METADATA_ADDRESSES.contains(address)) {
                return true;
            }
        }
        return false;
    }

    /** Metadata services that are not link-local, so the address-class checks miss them. */
    private static Set<InetAddress> metadataAddresses() {
        try {
            return Set.of(
                    InetAddress.getByName("100.100.100.200"), // Alibaba Cloud
                    InetAddress.getByName("fd00:ec2::254")); // AWS IMDS over IPv6
        } catch (UnknownHostException e) {
            throw new IllegalStateException("IP literals do not resolve", e);
        }
    }
}
