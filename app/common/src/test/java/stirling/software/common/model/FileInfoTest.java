package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

public class FileInfoTest {

    private static final LocalDateTime FIXED_NOW = LocalDateTime.of(2025, 11, 1, 12, 0, 0);

    @ParameterizedTest(name = "{index}: fileSize={0}")
    @CsvSource({
        "0, '0 Bytes'",
        "1023, '1023 Bytes'",
        "1024, '1.00 KB'",
        "1048575, '1024.00 KB'", // Do we really want this as result?
        "1048576, '1.00 MB'",
        "1073741823, '1024.00 MB'", // Do we really want this as result?
        "1073741824, '1.00 GB'"
    })
    void testGetFormattedFileSize(long fileSize, String expectedFormattedSize) {
        FileInfo fileInfo =
                new FileInfo(
                        "example.txt",
                        "/path/to/example.txt",
                        FIXED_NOW,
                        fileSize,
                        FIXED_NOW.minusDays(1));

        assertEquals(expectedFormattedSize, fileInfo.getFormattedFileSize());
    }

    @Nested
    @DisplayName("getFilePathAsPath")
    class GetFilePathAsPathTests {
        @Test
        @DisplayName("Should convert filePath string into a Path instance")
        void shouldConvertStringToPath() {
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            FIXED_NOW,
                            123,
                            FIXED_NOW.minusDays(1));

            Path path = fi.getFilePathAsPath();

            // Basic sanity checks
            assertNotNull(path, "Path should not be null");
            assertEquals(
                    Path.of("/path/to/example.txt"),
                    path,
                    "Converted Path should match input string");
        }
    }

    @Nested
    @DisplayName("Date formatting")
    class DateFormattingTests {
        @Test
        @DisplayName("Should format modificationDate as 'yyyy-MM-dd HH:mm:ss'")
        void shouldFormatModificationDate() {
            LocalDateTime mod = LocalDateTime.of(2025, 8, 10, 15, 30, 45);
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            mod,
                            1,
                            LocalDateTime.of(2024, 1, 1, 0, 0, 0));

            assertEquals("2025-08-10 15:30:45", fi.getFormattedModificationDate());
        }

        @Test
        @DisplayName("Should format creationDate as 'yyyy-MM-dd HH:mm:ss'")
        void shouldFormatCreationDate() {
            LocalDateTime created = LocalDateTime.of(2024, 12, 31, 23, 59, 59);
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            LocalDateTime.of(2025, 1, 1, 0, 0, 0),
                            1,
                            created);

            assertEquals("2024-12-31 23:59:59", fi.getFormattedCreationDate());
        }

        @Test
        @DisplayName("Should throw NPE when modificationDate is null (current behavior)")
        void shouldThrowWhenModificationDateNull() {
            // Assumption: Current implementation does not guard null -> NPE is expected.
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            null, // modificationDate null
                            1,
                            FIXED_NOW);

            assertThrows(
                    NullPointerException.class,
                    fi::getFormattedModificationDate,
                    "Formatting a null modificationDate should throw NPE with current"
                            + " implementation");
        }

        @Test
        @DisplayName("Should throw NPE when creationDate is null (current behavior)")
        void shouldThrowWhenCreationDateNull() {
            // Assumption: Current implementation does not guard null -> NPE is expected.
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            FIXED_NOW,
                            1,
                            null); // creationDate null

            assertThrows(
                    NullPointerException.class,
                    fi::getFormattedCreationDate,
                    "Formatting a null creationDate should throw NPE with current implementation");
        }
    }

    @Nested
    @DisplayName("Additional size formatting cases")
    class AdditionalSizeFormattingTests {

        @Test
        @DisplayName("Should round to two decimals for KB (e.g., 1536 B -> 1.50 KB)")
        void shouldRoundKbToTwoDecimals() {
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            FIXED_NOW,
                            1536, // 1.5 KB
                            FIXED_NOW.minusDays(1));

            assertEquals("1.50 KB", fi.getFormattedFileSize());
        }

        @Test
        @DisplayName("Values above 1 TB are still represented in GB (design choice)")
        void shouldRepresentTerabytesInGb() {
            // 2 TB = 2 * 1024 GB -> 2 * 1024 * 1024^3 bytes
            long twoTB = 2L * 1024 * 1024 * 1024 * 1024; // 2 * 2^40
            FileInfo fi =
                    new FileInfo(
                            "example.txt",
                            "/path/to/example.txt",
                            FIXED_NOW,
                            twoTB,
                            FIXED_NOW.minusDays(1));

            // 2 TB equals 2048.00 GB with current implementation
            assertEquals(
                    "2048.00 GB",
                    fi.getFormattedFileSize(),
                    "Current implementation caps at GB and shows TB in GB units");
        }
    }
}
