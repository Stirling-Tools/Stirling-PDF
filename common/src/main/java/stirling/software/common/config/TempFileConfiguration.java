package stirling.software.common.config;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.util.TempFileRegistry;

/**
 * Configuration for the temporary file management system. Sets up the necessary beans and
 * configures system properties.
 */
@Slf4j
@Configuration
public class TempFileConfiguration {

    @Value("${stirling.tempfiles.directory:${java.io.tmpdir}/stirling-pdf}")
    private String customTempDirectory;

    @Autowired
    @Qualifier("machineType")
    private String machineType;

    @Value("${stirling.tempfiles.prefix:stirling-pdf-}")
    private String tempFilePrefix;

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
            // Create the temp directory if it doesn't exist
            Path tempDir = Path.of(customTempDirectory);
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
                log.info("Created temporary directory: {}", tempDir);
            }

            log.info("Temporary file configuration initialized");
            log.info("Using temp directory: {}", customTempDirectory);
            log.info("Temp file prefix: {}", tempFilePrefix);
        } catch (Exception e) {
            log.error("Failed to initialize temporary file configuration", e);
        }
    }
}