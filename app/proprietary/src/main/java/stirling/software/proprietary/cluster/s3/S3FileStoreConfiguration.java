package stirling.software.proprietary.cluster.s3;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.model.ApplicationProperties;

/** Activates the S3-backed transient {@link FileStore} when {@code cluster.artifactStore=s3}. */
@Slf4j
@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "cluster", name = "artifactStore", havingValue = "s3")
public class S3FileStoreConfiguration {

    private final ApplicationProperties applicationProperties;

    @Bean(destroyMethod = "close")
    @ConditionalOnMissingBean
    public FileStore fileStore(@Value("${cluster.s3.keyPrefix:transient/}") String keyPrefix) {
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
}
