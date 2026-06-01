package stirling.software.common.cluster.inprocess;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.common.cluster.FileStore;

/**
 * Always-on wiring for the per-node local-disk {@link FileStore}. Active when {@code
 * cluster.artifactStore=local} (the default; {@code matchIfMissing=true}). The S3 artifact-store
 * supplies its own bean when {@code cluster.artifactStore=s3}.
 */
@Configuration
@ConditionalOnProperty(
        prefix = "cluster",
        name = "artifactStore",
        havingValue = "local",
        matchIfMissing = true)
public class LocalDiskFileStoreConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public FileStore fileStore(@Value("${stirling.tempDir:/tmp/stirling-files}") String tempDir) {
        return new LocalDiskFileStore(tempDir);
    }
}
