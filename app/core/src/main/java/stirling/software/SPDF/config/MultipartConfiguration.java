package stirling.software.SPDF.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.servlet.MultipartConfigElement;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.controller.web.UploadLimitService;

/**
 * Configuration for multipart file upload settings. Synchronizes multipart limits with
 * fileUploadLimit from settings.yml or environment variables (SYSTEMFILEUPLOADLIMIT or
 * SYSTEM_MAXFILESIZE).
 *
 * <p>NOTE (Quarkus migration): With quarkus-undertow the produced {@link MultipartConfigElement} is
 * honored for servlet-based multipart handling. For JAX-RS (RESTEasy Reactive) multipart endpoints
 * the effective request-size limit is instead controlled by the Quarkus HTTP layer via {@code
 * quarkus.http.limits.max-body-size} / {@code quarkus.http.limits.max-form-attribute-size}. Those
 * static properties cannot be derived from a runtime setting, so the dynamic limit computed here
 * only fully applies to servlet multipart parsing.
 */
@ApplicationScoped
@Slf4j
public class MultipartConfiguration {

    @Inject UploadLimitService uploadLimitService;

    /**
     * Produces a MultipartConfigElement that respects fileUploadLimit from settings.yml or
     * environment variables (SYSTEMFILEUPLOADLIMIT or SYSTEM_MAXFILESIZE).
     */
    // NOTE (Quarkus migration): @DependsOn("applicationProperties") dropped. CDI resolves the
    // UploadLimitService dependency on first use; ApplicationProperties @PostConstruct ordering is
    // handled by CDI initialization rather than an explicit bean dependency.
    @Produces
    @ApplicationScoped
    public MultipartConfigElement multipartConfigElement() {
        // First check if SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE is explicitly set
        String springMaxFileSize =
                java.lang.System.getenv("SPRING_SERVLET_MULTIPART_MAX_FILE_SIZE");
        long uploadLimitBytes = 0;

        if (springMaxFileSize != null && !springMaxFileSize.trim().isEmpty()) {
            // Parse the data-size property format (e.g., "2000MB")
            try {
                uploadLimitBytes = parseDataSize(springMaxFileSize.trim());
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

        // Set max file size and max request size to the same value.
        // MultipartConfigElement(location, maxFileSize, maxRequestSize, fileSizeThreshold)
        return new MultipartConfigElement("", uploadLimitBytes, uploadLimitBytes, 0);
    }

    /**
     * Parses a data-size string such as "2000MB", "10KB", "5GB" or a plain byte count into bytes.
     * Replaces Spring's {@code org.springframework.util.unit.DataSize#parse}. Supports the suffixes
     * B, KB, MB, GB, TB (case-insensitive); a bare number is treated as bytes.
     */
    private static long parseDataSize(String value) {
        String trimmed = value.trim().toUpperCase();
        long multiplier = 1L;
        String numberPart = trimmed;
        if (trimmed.endsWith("TB")) {
            multiplier = 1024L * 1024 * 1024 * 1024;
            numberPart = trimmed.substring(0, trimmed.length() - 2);
        } else if (trimmed.endsWith("GB")) {
            multiplier = 1024L * 1024 * 1024;
            numberPart = trimmed.substring(0, trimmed.length() - 2);
        } else if (trimmed.endsWith("MB")) {
            multiplier = 1024L * 1024;
            numberPart = trimmed.substring(0, trimmed.length() - 2);
        } else if (trimmed.endsWith("KB")) {
            multiplier = 1024L;
            numberPart = trimmed.substring(0, trimmed.length() - 2);
        } else if (trimmed.endsWith("B")) {
            numberPart = trimmed.substring(0, trimmed.length() - 1);
        }
        return Long.parseLong(numberPart.trim()) * multiplier;
    }
}
