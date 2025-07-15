package stirling.software.common.config;

import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileRegistry;

/**
 * Configuration for the temporary file management system. Sets up the necessary beans and
 * configures system properties.
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class TempFileConfiguration {

    private final ApplicationProperties applicationProperties;

    /**
     * Create the TempFileRegistry bean.
     *
     * @return A new TempFileRegistry instance
     */
    @Bean
    public TempFileRegistry tempFileRegistry() {
        return new TempFileRegistry();
    }

    @PostConstruct
    public void initTempFileConfig() {
        try {
            ApplicationProperties.TempFileManagement tempFiles =
                    applicationProperties.getSystem().getTempFileManagement();
            String customTempDirectory = tempFiles.getBaseTmpDir();

            // Create the temp directory if it doesn't exist
            Path tempDir = Path.of(customTempDirectory);
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
                log.info("Created temporary directory: {}", tempDir);
            }

            log.debug("Temporary file configuration initialized");
            log.debug("Using temp directory: {}", customTempDirectory);
            log.debug("Temp file prefix: {}", tempFiles.getPrefix());
        } catch (Exception e) {
            log.error("Failed to initialize temporary file configuration", e);
        }
    }
}
