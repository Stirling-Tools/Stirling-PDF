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

    @Value("${stirling.tempfiles.directory:}")
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
            // If a custom temp directory is specified in the config, use it
            if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
                Path tempDir = Path.of(customTempDirectory);
                if (!Files.exists(tempDir)) {
                    Files.createDirectories(tempDir);
                    log.info("Created custom temporary directory: {}", tempDir);
                }

                // Set Java temp directory system property if in Docker/Kubernetes mode
                if ("Docker".equals(machineType) || "Kubernetes".equals(machineType)) {
                    System.setProperty("java.io.tmpdir", customTempDirectory);
                    log.info(
                            "Set system temp directory to: {} for environment: {}",
                            customTempDirectory,
                            machineType);
                }
            } else {
                // No custom directory specified, use java.io.tmpdir + application subfolder
                String defaultTempDir;
                
                if ("Docker".equals(machineType) || "Kubernetes".equals(machineType)) {
                    // Container environments should continue to use /tmp/stirling-pdf
                    defaultTempDir = "/tmp/stirling-pdf";
                } else {
                    // Use system temp directory (java.io.tmpdir) with our application subfolder
                    // This automatically handles Windows (AppData\Local\Temp), macOS, and Linux systems
                    defaultTempDir = System.getProperty("java.io.tmpdir") + File.separator + "stirling-pdf";
                }
                customTempDirectory = defaultTempDir;
                
                // Create the default temp directory
                Path tempDir = Path.of(customTempDirectory);
                if (!Files.exists(tempDir)) {
                    Files.createDirectories(tempDir);
                    log.info("Created default OS-specific temporary directory: {}", tempDir);
                }
            }

            log.info("Temporary file configuration initialized");
            log.info("Using temp directory: {}", customTempDirectory);
            log.info("Temp file prefix: {}", tempFilePrefix);
        } catch (Exception e) {
            log.error("Failed to initialize temporary file configuration", e);
        }
    }
}
