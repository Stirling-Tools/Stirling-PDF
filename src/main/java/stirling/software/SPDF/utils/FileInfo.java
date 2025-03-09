package stirling.software.SPDF.utils;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

import lombok.AllArgsConstructor;
import lombok.Data;

@AllArgsConstructor
@Data
public class FileInfo {
    private static final DateTimeFormatter DATE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private String fileName;
    private String filePath;
    private LocalDateTime modificationDate;
    private long fileSize;
    private LocalDateTime creationDate;

    // Converts the file path string to a Path object.
    public Path getFilePathAsPath() {
        return Paths.get(filePath);
    }

    // Formats the file size into a human-readable string.
    public String getFormattedFileSize() {
        if (fileSize >= 1024 * 1024 * 1024) {
            return String.format(Locale.US, "%.2f GB", fileSize / (1024.0 * 1024 * 1024));
        } else if (fileSize >= 1024 * 1024) {
            return String.format(Locale.US, "%.2f MB", fileSize / (1024.0 * 1024));
        } else if (fileSize >= 1024) {
            return String.format(Locale.US, "%.2f KB", fileSize / 1024.0);
        } else {
            return String.format("%d Bytes", fileSize);
        }
    }

    // Formats the modification date to a string.
    public String getFormattedModificationDate() {
        return modificationDate.format(DATE_FORMATTER);
    }

    // Formats the creation date to a string.
    public String getFormattedCreationDate() {
        return creationDate.format(DATE_FORMATTER);
    }
}
