package stirling.software.proprietary.policy.s3;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.cluster.s3.S3Clients;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * Long-lived {@link S3Client}s for policy S3 sources and sinks, one per distinct {@link S3Config},
 * closed at shutdown. An edited spec simply maps to a new entry, and a stale entry costs nothing
 * (the URL-connection HTTP client holds no pooled sockets or threads). Clients sign exclusively
 * with the spec's own credentials - there is deliberately no fallback to the server's AWS
 * credential chain, so user-supplied config can never borrow the host's identity. Endpoints are
 * guarded against private addresses before a client is ever built, since they come from portal
 * users rather than the operator.
 */
@Service
public class S3ConnectionPool {

    private final ApplicationProperties applicationProperties;
    private final Function<S3Config, S3Client> clientFactory;
    private final Map<S3Config, S3Client> clients = new ConcurrentHashMap<>();

    @Autowired
    public S3ConnectionPool(ApplicationProperties applicationProperties) {
        this(applicationProperties, S3ConnectionPool::buildClient);
    }

    /** Factory-injecting constructor for tests. */
    public S3ConnectionPool(
            ApplicationProperties applicationProperties,
            Function<S3Config, S3Client> clientFactory) {
        this.applicationProperties = applicationProperties;
        this.clientFactory = clientFactory;
    }

    public S3Client clientFor(S3Config config) {
        return clients.computeIfAbsent(
                config,
                c -> {
                    requirePermittedEndpoint(c);
                    return clientFactory.apply(c);
                });
    }

    /**
     * A user-supplied endpoint must not reach loopback, link-local, or private addresses unless the
     * operator has opted in via {@code policies.allowPrivateS3Endpoints}.
     */
    private void requirePermittedEndpoint(S3Config config) {
        if (config.endpoint() == null) {
            return;
        }
        try {
            S3Clients.validateEndpointHost(
                    URI.create(config.endpoint()),
                    applicationProperties.getPolicies().isAllowPrivateS3Endpoints(),
                    "S3 source endpoint",
                    "set policies.allowPrivateS3Endpoints=true to opt in (e.g. for a local"
                            + " MinIO).");
        } catch (IllegalStateException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }

    private static S3Client buildClient(S3Config config) {
        S3ClientBuilder builder =
                S3Client.builder()
                        .httpClient(UrlConnectionHttpClient.create())
                        .region(Region.of(config.region()))
                        // Path-style addressing whenever a custom endpoint is set: S3-compatible
                        // stores rarely support virtual-hosted bucket DNS.
                        .serviceConfiguration(
                                S3Configuration.builder()
                                        .pathStyleAccessEnabled(config.endpoint() != null)
                                        .build())
                        .credentialsProvider(
                                StaticCredentialsProvider.create(
                                        AwsBasicCredentials.create(
                                                config.accessKeyId(), config.secretAccessKey())));
        if (config.endpoint() != null) {
            builder.endpointOverride(URI.create(config.endpoint()));
        }
        return builder.build();
    }

    @PreDestroy
    void closeClients() {
        clients.values().forEach(S3Client::close);
        clients.clear();
    }
}
