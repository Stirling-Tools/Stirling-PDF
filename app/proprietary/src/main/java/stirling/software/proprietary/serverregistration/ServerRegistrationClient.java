package stirling.software.proprietary.serverregistration;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import stirling.software.proprietary.accountlink.AccountLinkProperties;

import tools.jackson.databind.ObjectMapper;

/**
 * Bounded, nonredirecting transport. Neither license proofs nor upstream bodies enter exceptions.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class ServerRegistrationClient {
    private final URI base;
    private final Duration timeout;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @Autowired
    public ServerRegistrationClient(AccountLinkProperties properties, ObjectMapper mapper) {
        this(
                properties,
                mapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(properties.getRequestTimeoutSeconds()))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    ServerRegistrationClient(
            AccountLinkProperties properties, ObjectMapper mapper, HttpClient http) {
        this.base = URI.create(properties.getSaasBaseUrl().replaceAll("/+$", ""));
        this.timeout = Duration.ofSeconds(properties.getRequestTimeoutSeconds());
        this.mapper = mapper;
        this.http = http;
        boolean loopback =
                base.getHost() != null
                        && Set.of("localhost", "127.0.0.1", "[::1]").contains(base.getHost());
        if (base.getHost() == null
                || (!"https".equals(base.getScheme())
                        && !("http".equals(base.getScheme()) && loopback))
                || base.getRawUserInfo() != null
                || base.getRawQuery() != null
                || base.getRawFragment() != null) {
            throw new IllegalArgumentException(
                    "Registration requires HTTPS, except loopback development");
        }
    }

    /** Bootstraps with a license proof; retry with the same persisted secret after a lost reply. */
    public ServerRegistrationProtocol.Receipt register(
            ServerRegistrationProtocol.RegistrationRequest request) throws IOException {
        return send(ServerRegistrationProtocol.PATH, request);
    }

    /** Reports with the tracking credential only; does not request or cache any entitlement. */
    public ServerRegistrationProtocol.Receipt sync(ServerRegistrationProtocol.SyncRequest request)
            throws IOException {
        return send(ServerRegistrationProtocol.PATH + "/sync", request);
    }

    private ServerRegistrationProtocol.Receipt send(String path, Object payload)
            throws IOException {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(base.toString() + path))
                        .timeout(timeout)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(
                                HttpRequest.BodyPublishers.ofString(
                                        mapper.writeValueAsString(payload)))
                        .build();
        try {
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IOException("Registration returned HTTP " + response.statusCode());
            }
            ServerRegistrationProtocol.Receipt receipt;
            try {
                receipt =
                        mapper.readValue(response.body(), ServerRegistrationProtocol.Receipt.class);
            } catch (RuntimeException e) {
                throw new IOException("Invalid registration response");
            }
            if (receipt.registrationId() == null
                    || receipt.acceptedSequence() < 1
                    || receipt.purchaseMapping() == null) {
                throw new IOException("Incomplete registration response");
            }
            return receipt;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Registration interrupted");
        }
    }
}
