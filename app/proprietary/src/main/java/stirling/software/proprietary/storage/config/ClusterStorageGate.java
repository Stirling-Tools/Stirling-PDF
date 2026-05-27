package stirling.software.proprietary.storage.config;

import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Fails fast at boot if cluster mode is enabled with node-local storage. Validates both {@code
 * storage.provider} (persistent uploads) and {@code cluster.artifactStore} (transient job-result
 * files): neither may be {@code local} when {@code cluster.enabled=true}.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
public class ClusterStorageGate {

    private final ApplicationProperties applicationProperties;

    @Value("${cluster.enabled:false}")
    private boolean clusterEnabled;

    @Value("${cluster.artifactStore:local}")
    private String clusterArtifactStore;

    @PostConstruct
    void validate() {
        if (!clusterEnabled) {
            return;
        }
        ApplicationProperties.Storage storage = applicationProperties.getStorage();
        if (storage != null && storage.isEnabled()) {
            validate(
                    "storage.provider",
                    storage.getProvider(),
                    "Local filesystem storage cannot be shared across cluster nodes."
                            + " Configure storage.provider=s3 (with storage.s3.bucket /"
                            + " endpoint / credentials) or storage.provider=database before"
                            + " enabling clustering.");
        }
        validate(
                "cluster.artifactStore",
                clusterArtifactStore,
                "Per-node disk cannot back transient job-result files in a multi-node"
                        + " deployment; downloads would 404 whenever the load balancer routes"
                        + " a follow-up request to a different node. Configure"
                        + " cluster.artifactStore=s3 (reuses storage.s3.* config)"
                        + " before enabling clustering.");
    }

    private static void validate(String propertyName, String configuredValue, String remediation) {
        String normalized =
                Optional.ofNullable(configuredValue)
                        .orElse("local")
                        .trim()
                        .toLowerCase(Locale.ROOT);
        if ("local".equals(normalized)) {
            throw new IllegalStateException(
                    "Cluster mode (cluster.enabled=true) is incompatible with "
                            + propertyName
                            + "=local. "
                            + remediation);
        }
        log.info(
                "Cluster storage gate: clusterEnabled=true, {}={} -> OK", propertyName, normalized);
    }
}
