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

/** Whether an OpenID Connect issuer answers discovery; setup checks one before saving it. */
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

    /** True when the issuer's discovery document names it exactly, as Spring does. Never throws. */
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
