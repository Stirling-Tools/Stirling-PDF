package stirling.software.proprietary.cluster.s3;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Disposes;
import jakarta.enterprise.inject.Produces;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.ApplicationProperties;

/** Activates the S3-backed transient {@link FileStore} when {@code cluster.artifactStore=s3}. */
// TODO: Migration required - the original Spring class was guarded by
// @ConditionalOnProperty(prefix="cluster", name="artifactStore", havingValue="s3") and
// @ConditionalOnMissingBean on the @Bean. The S3 producer below is gated with
// @io.quarkus.arc.lookup.LookupIfProperty(name="cluster.artifactStore", stringValue="s3"), which
// only contributes this FileStore when the property is "s3"; the always-on @DefaultBean producer in
// common's LocalDiskFileStoreConfiguration covers the "local"/default case, so S3 here wins (a
// non-default producer beats @DefaultBean) only when the property selects it - preserving the
// original @ConditionalOnMissingBean intent. Note: @LookupIfProperty is evaluated at build time, so
// the artifact store cannot be switched at runtime. If a true runtime toggle is required, drop the
// annotation and gate the producer body on the config value instead.
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class S3FileStoreConfiguration {

    private final ApplicationProperties applicationProperties;

    @Produces
    @ApplicationScoped
    @LookupIfProperty(name = "cluster.artifactStore", stringValue = "s3")
    public FileStore fileStore(
            @ConfigProperty(name = "cluster.s3.keyPrefix", defaultValue = "transient/")
                    String keyPrefix) {
        ApplicationProperties.Storage.S3 cfg = applicationProperties.getStorage().getS3();
        S3Clients.Bundle bundle = S3Clients.build(cfg, "cluster file store");
        // FileStore has no signed-URL contract; close the unused presigner immediately.
        try {
            bundle.presigner().close();
        } catch (Exception ignored) {
        }
        log.info("Cluster FileStore: s3 (bucket={}, keyPrefix={})", cfg.getBucket(), keyPrefix);
        return new S3FileStore(bundle.client(), cfg.getBucket(), keyPrefix, true);
    }

    /**
     * Replaces the Spring {@code @Bean(destroyMethod = "close")} contract: CDI does not auto-invoke
     * close() on producer-created beans, so this disposer closes the {@link S3FileStore} when the
     * bean is destroyed.
     */
    void closeFileStore(@Disposes FileStore fileStore) {
        if (fileStore instanceof S3FileStore s3FileStore) {
            try {
                s3FileStore.close();
            } catch (Exception ignored) {
            }
        }
    }
}
