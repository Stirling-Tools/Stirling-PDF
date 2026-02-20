package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.servlet.MultipartConfigFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.util.unit.DataSize;

import jakarta.servlet.MultipartConfigElement;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.controller.web.UploadLimitService;

/**
 * Configuration for Spring multipart file upload settings. Synchronizes multipart limits with
 * fileUploadLimit from settings.yml or environment variables (SYSTEMFILEUPLOADLIMIT or
 * SYSTEM_MAXFILESIZE).
 */
@Configuration
@Slf4j
public class MultipartConfiguration {

    @Autowired private UploadLimitService uploadLimitService;

    /**
     * Creates MultipartConfigElement that respects fileUploadLimit from settings.yml or environment
     * variables (SYSTEMFILEUPLOADLIMIT or SYSTEM_MAXFILESIZE). Depends on ApplicationProperties
     * being initialized so @PostConstruct has run.
     */
    @Bean
    @DependsOn("applicationProperties")
    public MultipartConfigElement multipartConfigElement() {
        MultipartConfigFactory factory = new MultipartConfigFactory();

        // First check if SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is explicitly set
        String springMaxFileSize =
                java.lang.System.getenv("SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE");
        long uploadLimitBytes = 0;

        if (springMaxFileSize != null && !springMaxFileSize.trim().isEmpty()) {
            // Parse the Spring property format (e.g., "2000MB")
            try {
                DataSize dataSize = DataSize.parse(springMaxFileSize.trim());
                uploadLimitBytes = dataSize.toBytes();
                log.info("Using SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE: {}", springMaxFileSize);
            } catch (Exception e) {
                log.warn(
                        "Failed to parse SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE: {}",
                        springMaxFileSize,
                        e);
            }
        }

        // If not set via Spring property, use UploadLimitService which reads from
        // fileUploadLimit (set from SYSTEMFILEUPLOADLIMIT/SYSTEM_MAXFILESIZE or settings.yml)
        if (uploadLimitBytes == 0) {
            uploadLimitBytes = uploadLimitService.getUploadLimit();
            if (uploadLimitBytes > 0) {
                log.info(
                        "Using fileUploadLimit setting: {}",
                        uploadLimitService.getReadableUploadLimit());
            }
        }

        // If still no limit, use default of 2000MB
        if (uploadLimitBytes == 0) {
            uploadLimitBytes = 2000L * 1024 * 1024; // 2000MB default
            log.info("Using default multipart file upload limit: 2000MB");
        }

        // Set max file size and max request size to the same value
        factory.setMaxFileSize(DataSize.ofBytes(uploadLimitBytes));
        factory.setMaxRequestSize(DataSize.ofBytes(uploadLimitBytes));

        return factory.createMultipartConfig();
    }
}
