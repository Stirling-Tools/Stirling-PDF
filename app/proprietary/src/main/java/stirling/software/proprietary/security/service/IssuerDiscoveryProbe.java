package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Checks that an OpenID Connect issuer answers discovery. OAuth sign-in and MCP's OAuth mode both
 * read {@code <issuer>/.well-known/openid-configuration}; an issuer that does not answer stops
 * sign-in from being registered, so the setup wizard checks it before saving.
 */
@Service
@Slf4j
public class IssuerDiscoveryProbe {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final String DISCOVERY_PATH = "/.well-known/openid-configuration";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public IssuerDiscoveryProbe(ObjectMapper objectMapper) {
        this(
                HttpClient.newBuilder()
                        .connectTimeout(TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NORMAL)
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
        URI discovery;
        try {
            URI base = URI.create(issuer.trim().replaceAll("/+$", ""));
            String scheme =
                    base.getScheme() == null ? "" : base.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https") || base.getHost() == null) {
                return false;
            }
            discovery = URI.create(base + DISCOVERY_PATH);
        } catch (IllegalArgumentException e) {
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
}
