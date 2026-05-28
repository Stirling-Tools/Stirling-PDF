package stirling.software.proprietary.cluster.s3;

import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * Shared factory for {@link S3Client} and {@link S3Presigner} instances used by both {@code
 * S3StorageProvider} and {@code S3FileStore}, so endpoint/region/credentials wiring lives in
 * exactly one place.
 */
@Slf4j
public final class S3Clients {

    private S3Clients() {}

    /** Paired client and presigner with coordinated lifecycle. */
    public record Bundle(S3Client client, S3Presigner presigner) implements AutoCloseable {
        @Override
        public void close() {
            try {
                presigner.close();
            } catch (Exception e) {
                log.warn("Error closing S3 presigner", e);
            }
            try {
                client.close();
            } catch (Exception e) {
                log.warn("Error closing S3 client", e);
            }
        }
    }

    /** Build a client+presigner pair from the shared S3 config block. */
    public static Bundle build(ApplicationProperties.Storage.S3 cfg, String usage) {
        if (cfg == null) {
            throw new IllegalStateException(
                    usage + " requires storage.s3.* configuration to be set");
        }
        if (cfg.getBucket() == null || cfg.getBucket().isBlank()) {
            throw new IllegalStateException(usage + " requires storage.s3.bucket to be set");
        }
        String region =
                cfg.getRegion() == null || cfg.getRegion().isBlank()
                        ? "us-east-1"
                        : cfg.getRegion();

        S3Configuration s3Configuration =
                S3Configuration.builder().pathStyleAccessEnabled(cfg.isPathStyleAccess()).build();

        RequestChecksumCalculation requestChecksum =
                parseRequestChecksum(cfg.getRequestChecksumCalculation());
        ResponseChecksumValidation responseChecksum =
                parseResponseChecksum(cfg.getResponseChecksumValidation());

        S3ClientBuilder clientBuilder =
                S3Client.builder()
                        .httpClient(UrlConnectionHttpClient.create())
                        .region(Region.of(region))
                        .serviceConfiguration(s3Configuration)
                        .requestChecksumCalculation(requestChecksum)
                        .responseChecksumValidation(responseChecksum);

        S3Presigner.Builder presignerBuilder =
                S3Presigner.builder()
                        .region(Region.of(region))
                        .serviceConfiguration(s3Configuration);

        if (cfg.getEndpoint() != null && !cfg.getEndpoint().isBlank()) {
            URI endpoint;
            try {
                endpoint = new URI(cfg.getEndpoint());
            } catch (URISyntaxException e) {
                throw new IllegalStateException(
                        "Invalid storage.s3.endpoint: " + cfg.getEndpoint(), e);
            }
            validateEndpointHost(endpoint, cfg.isAllowPrivateEndpoints());
            clientBuilder.endpointOverride(endpoint);
            presignerBuilder.endpointOverride(endpoint);
        }

        boolean hasStaticCreds =
                cfg.getAccessKey() != null
                        && !cfg.getAccessKey().isBlank()
                        && cfg.getSecretKey() != null
                        && !cfg.getSecretKey().isBlank();
        if (hasStaticCreds) {
            AwsBasicCredentials credentials =
                    AwsBasicCredentials.create(cfg.getAccessKey(), cfg.getSecretKey());
            StaticCredentialsProvider provider = StaticCredentialsProvider.create(credentials);
            clientBuilder.credentialsProvider(provider);
            presignerBuilder.credentialsProvider(provider);
        } else {
            clientBuilder.credentialsProvider(DefaultCredentialsProvider.create());
            presignerBuilder.credentialsProvider(DefaultCredentialsProvider.create());
        }

        log.debug(
                "Configured S3 {}: bucket={}, region={}, endpoint={}, pathStyle={}",
                usage,
                cfg.getBucket(),
                region,
                cfg.getEndpoint() == null || cfg.getEndpoint().isBlank()
                        ? "<aws-default>"
                        : cfg.getEndpoint(),
                cfg.isPathStyleAccess());

        return new Bundle(clientBuilder.build(), presignerBuilder.build());
    }

    /**
     * Block SSRF via the S3 endpoint setting. An admin who can edit config could otherwise point
     * the SDK at the cloud metadata service (e.g. {@code http://169.254.169.254/}) and exfiltrate
     * instance-role credentials. Reject any endpoint whose host resolves to a loopback, link-local,
     * or RFC1918 private address unless the operator has explicitly opted in via {@code
     * storage.s3.allow-private-endpoints=true}.
     */
    static void validateEndpointHost(URI endpoint, boolean allowPrivate) {
        if (allowPrivate) {
            return;
        }
        String host = endpoint.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalStateException("storage.s3.endpoint must include a host: " + endpoint);
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalStateException(
                    "Unable to resolve storage.s3.endpoint host '" + host + "'", e);
        }
        for (InetAddress address : addresses) {
            if (isPrivateOrLocal(address)) {
                throw new IllegalStateException(
                        "storage.s3.endpoint host '"
                                + host
                                + "' resolves to private/link-local address "
                                + address.getHostAddress()
                                + "; set storage.s3.allow-private-endpoints=true to opt in"
                                + " (e.g. for MinIO or in-cluster S3).");
            }
        }
    }

    private static boolean isPrivateOrLocal(InetAddress address) {
        return address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isAnyLocalAddress()
                || address.isMulticastAddress();
    }

    static RequestChecksumCalculation parseRequestChecksum(String value) {
        if (value == null || value.isBlank()) {
            return RequestChecksumCalculation.WHEN_SUPPORTED;
        }
        try {
            return RequestChecksumCalculation.valueOf(
                    value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "Unknown storage.s3.request-checksum-calculation value '{}', falling back to WHEN_SUPPORTED",
                    value);
            return RequestChecksumCalculation.WHEN_SUPPORTED;
        }
    }

    static ResponseChecksumValidation parseResponseChecksum(String value) {
        if (value == null || value.isBlank()) {
            return ResponseChecksumValidation.WHEN_SUPPORTED;
        }
        try {
            return ResponseChecksumValidation.valueOf(
                    value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            log.warn(
                    "Unknown storage.s3.response-checksum-validation value '{}', falling back to WHEN_SUPPORTED",
                    value);
            return ResponseChecksumValidation.WHEN_SUPPORTED;
        }
    }
}
