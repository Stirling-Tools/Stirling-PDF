package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;

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
 * lives on one. Link-local addresses, which include the cloud metadata service, are refused, and
 * redirects are not followed, so a redirect cannot move the request onto one.
 */
@Service
@Slf4j
public class IssuerDiscoveryProbe {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final String DISCOVERY_PATH = "/.well-known/openid-configuration";

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
     * True when {@code issuer} is an http(s) URL whose discovery document names an issuer. Never
     * throws: an unreachable, slow or malformed issuer is simply false.
     */
    public boolean answersDiscovery(String issuer) {
        if (issuer == null) {
            return false;
        }
        URI discovery;
        try {
            URI base = URI.create(withoutTrailingSlashes(issuer.trim()));
            String scheme =
                    base.getScheme() == null ? "" : base.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https") || base.getHost() == null) {
                return false;
            }
            if (resolvesToLinkLocal(base.getHost())) {
                return false;
            }
            discovery = URI.create(base + DISCOVERY_PATH);
        } catch (IllegalArgumentException | UnknownHostException e) {
            return false;
        }
        try {
            HttpResponse<String> response =
                    httpClient.send(
                            HttpRequest.newBuilder(discovery).timeout(TIMEOUT).GET().build(),
                            HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return false;
            }
            JsonNode body = objectMapper.readTree(response.body());
            return body.hasNonNull("issuer");
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

    private static boolean resolvesToLinkLocal(String host) throws UnknownHostException {
        for (InetAddress address : InetAddress.getAllByName(host)) {
            if (address.isLinkLocalAddress()
                    || address.isAnyLocalAddress()
                    || address.isMulticastAddress()) {
                return true;
            }
        }
        return false;
    }
}
