package stirling.software.common.util;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * Utility class for generating consistent temporary file names. Provides methods to create
 * standardized, identifiable temp file names.
 */
public class TempFileNamingConvention {

    private static final String DEFAULT_PREFIX = "stirling-pdf-";
    private static final DateTimeFormatter DATE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    /**
     * Create a temporary file name for a specific operation type.
     *
     * @param operationType The type of operation (e.g., "merge", "split", "watermark")
     * @param extension File extension without the dot
     * @return A formatted temporary file name
     */
    public static String forOperation(String operationType, String extension) {
        String timestamp = LocalDateTime.now().format(DATE_FORMATTER);
        String uuid = UUID.randomUUID().toString().substring(0, 8);

        return DEFAULT_PREFIX + operationType + "-" + timestamp + "-" + uuid + "." + extension;
    }

    /**
     * Create a temporary file name for intermediate processing.
     *
     * @param operationType The type of operation
     * @param step The processing step number or identifier
     * @param extension File extension without the dot
     * @return A formatted temporary file name for intermediate processing
     */
    public static String forProcessingStep(String operationType, String step, String extension) {
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return DEFAULT_PREFIX + operationType + "-" + step + "-" + uuid + "." + extension;
    }

    /**
     * Create a temporary file name for a LibreOffice operation.
     *
     * @param sourceFilename The original filename
     * @param extension File extension without the dot
     * @return A formatted temporary file name for LibreOffice operations
     */
    public static String forLibreOffice(String sourceFilename, String extension) {
        // Extract base filename without extension
        String baseName = sourceFilename;
        int lastDot = sourceFilename.lastIndexOf('.');
        if (lastDot > 0) {
            baseName = sourceFilename.substring(0, lastDot);
        }

        // Sanitize the base name
        baseName = baseName.replaceAll("[^a-zA-Z0-9]", "_");

        // Limit the length of the base name
        if (baseName.length() > 20) {
            baseName = baseName.substring(0, 20);
        }

        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return DEFAULT_PREFIX + "lo-" + baseName + "-" + uuid + "." + extension;
    }

    /**
     * Create a temporary directory name.
     *
     * @param purpose The purpose of the directory
     * @return A formatted temporary directory name
     */
    public static String forTempDirectory(String purpose) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return DEFAULT_PREFIX + purpose + "-" + timestamp + "-" + uuid;
    }
}
