package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.nio.file.Path;
import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

public class FileInfoTest {

    // Use fixed deterministic timestamps for all tests
    static final LocalDateTime TEST_MOD_DATE = LocalDateTime.of(2024, 6, 15, 10, 30, 45);
    static final LocalDateTime TEST_CREATION_DATE = LocalDateTime.of(2024, 6, 14, 10, 30, 45);

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
                        TEST_MOD_DATE,
                        fileSize,
                        TEST_CREATION_DATE);

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
                            File.separator + "tmp" + File.separator + "test.pdf",
                            TEST_MOD_DATE,
                            1234,
                            TEST_CREATION_DATE);

            Path path = fi.getFilePathAsPath();

            // Basic sanity checks
            assertNotNull(path, "Path should not be null");
            assertEquals(
                    Path.of(File.separator + "tmp" + File.separator + "test.pdf"),
                    path,
                    "Converted Path should match input string");
        }
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
    void testGettersAndSetters() {
        FileInfo fileInfo =
                new FileInfo(
                        "doc.pdf",
                        File.separator + "docs" + File.separator + "doc.pdf",
                        FileInfoTest.TEST_MOD_DATE,
                        2048,
                        FileInfoTest.TEST_CREATION_DATE);
        // Test getters
        assertEquals("doc.pdf", fileInfo.getFileName());
        assertEquals(File.separator + "docs" + File.separator + "doc.pdf", fileInfo.getFilePath());
        assertEquals(FileInfoTest.TEST_MOD_DATE, fileInfo.getModificationDate());
        assertEquals(2048, fileInfo.getFileSize());
        assertEquals(FileInfoTest.TEST_CREATION_DATE, fileInfo.getCreationDate());

        // Test setters
        fileInfo.setFileName("new.pdf");
        fileInfo.setFilePath(File.separator + "new" + File.separator + "new.pdf");
        fileInfo.setModificationDate(FileInfoTest.TEST_MOD_DATE.plusDays(1));
        fileInfo.setFileSize(4096);
        fileInfo.setCreationDate(FileInfoTest.TEST_CREATION_DATE.minusDays(2));

        assertEquals("new.pdf", fileInfo.getFileName());
        assertEquals(File.separator + "new" + File.separator + "new.pdf", fileInfo.getFilePath());
        assertEquals(FileInfoTest.TEST_MOD_DATE.plusDays(1), fileInfo.getModificationDate());
        assertEquals(4096, fileInfo.getFileSize());
        assertEquals(FileInfoTest.TEST_CREATION_DATE.minusDays(2), fileInfo.getCreationDate());
    }
}
