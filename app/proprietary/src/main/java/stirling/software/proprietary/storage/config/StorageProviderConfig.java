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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.storage.provider.LocalStorageProvider;
import stirling.software.proprietary.storage.provider.StorageProvider;

@Configuration
@RequiredArgsConstructor
public class StorageProviderConfig {

    private final ApplicationProperties applicationProperties;

    @Bean
    public StorageProvider storageProvider() {
        String providerName =
                Optional.ofNullable(applicationProperties.getStorage().getProvider())
                        .orElse("local")
                        .trim()
                        .toLowerCase(Locale.ROOT);
        if (!"local".equals(providerName)) {
            throw new IllegalStateException(
                    "Storage provider not supported: " + providerName);
        }
        String basePathValue = applicationProperties.getStorage().getLocal().getBasePath();
        if (basePathValue == null || basePathValue.isBlank()) {
            throw new IllegalStateException("Storage base path is not configured");
        }
        Path basePath = Paths.get(basePathValue).toAbsolutePath().normalize();
        try {
            Files.createDirectories(basePath);
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Unable to create storage base directory: " + basePath, e);
        }
        return new LocalStorageProvider(basePath);
    }
}
