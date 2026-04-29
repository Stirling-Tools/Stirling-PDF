package stirling.software.proprietary.storage.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Optional;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.storage.provider.DatabaseStorageProvider;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.repository.StoredFileBlobRepository;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class StorageProviderConfig {

    private final ApplicationProperties applicationProperties;
    private final StoredFileBlobRepository storedFileBlobRepository;

    @Bean
    public StorageProvider storageProvider() {
        boolean storageEnabled = applicationProperties.getStorage().isEnabled();
        String providerName =
                Optional.ofNullable(applicationProperties.getStorage().getProvider())
                        .orElse("local")
                        .trim()
                        .toLowerCase(Locale.ROOT);
        if ("database".equals(providerName)) {
            return new DatabaseStorageProvider(storedFileBlobRepository);
        }
        if (!"local".equals(providerName)) {
            throw new IllegalStateException("Storage provider not supported: " + providerName);
        }
        String basePathValue = applicationProperties.getStorage().getLocal().getBasePath();
        if (basePathValue == null || basePathValue.isBlank()) {
            if (storageEnabled) {
                throw new IllegalStateException("Storage base path is not configured");
            }
            basePathValue = InstallationPathConfig.getPath() + "storage";
        }
        Path basePath = Paths.get(basePathValue).toAbsolutePath().normalize();
        Path installRoot = Paths.get(InstallationPathConfig.getPath()).toAbsolutePath().normalize();
        if (!basePath.startsWith(installRoot)) {
            // Warn rather than hard-fail: admins may legitimately point storage at an external
            // volume, but an unexpected path could indicate a misconfiguration or traversal
            // attempt.
            log.warn(
                    "Storage basePath '{}' is outside the installation directory '{}'. "
                            + "Verify this is intentional.",
                    basePath,
                    installRoot);
        }
        if (storageEnabled) {
            try {
                Files.createDirectories(basePath);
            } catch (IOException e) {
                throw new IllegalStateException(
                        "Unable to create storage base directory: " + basePath, e);
            }
        }
        return new LocalStorageProvider(basePath);
    }
}
