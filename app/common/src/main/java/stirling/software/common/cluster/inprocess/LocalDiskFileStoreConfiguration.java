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
