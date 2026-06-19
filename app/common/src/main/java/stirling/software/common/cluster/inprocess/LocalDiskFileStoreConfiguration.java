package stirling.software.common.cluster.inprocess;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.arc.DefaultBean;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import stirling.software.common.cluster.FileStore;

/**
 * Always-on wiring for the per-node local-disk {@link FileStore}. Active when {@code
 * cluster.artifactStore=local} (the default; {@code matchIfMissing=true}). The S3 artifact-store
 * supplies its own bean when {@code cluster.artifactStore=s3}.
 */
// TODO: Migration required - the original class was guarded by Spring's
// @ConditionalOnProperty(prefix="cluster", name="artifactStore", havingValue="local",
// matchIfMissing=true). Quarkus has no runtime equivalent: @io.quarkus.arc.profile.IfBuildProperty
// is build-time only and does not support matchIfMissing semantics. The producer below is now
// unconditional. The "local is the default; S3 supplies its own bean" behavior is preserved via
// @DefaultBean (the S3 artifact-store bean, if present, wins over this default). If a true
// runtime toggle on cluster.artifactStore is needed, gate the producer body on the config value
// and return/short-circuit accordingly.
@ApplicationScoped
public class LocalDiskFileStoreConfiguration {

    @Produces
    @DefaultBean
    @ApplicationScoped
    public FileStore fileStore(
            @ConfigProperty(name = "stirling.tempDir", defaultValue = "/tmp/stirling-files")
                    String tempDir) {
        return new LocalDiskFileStore(tempDir);
    }
}
