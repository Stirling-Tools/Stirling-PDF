package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.File;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

public class FileInfoTest {

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
                        File.separator
                                + "path"
                                + File.separator
                                + "to"
                                + File.separator
                                + "example.txt",
                        LocalDateTime.now(),
                        fileSize,
                        LocalDateTime.now().minusDays(1));

        assertEquals(expectedFormattedSize, fileInfo.getFormattedFileSize());
    }

    @Test
    void testGetFilePathAsPath() {
        FileInfo fileInfo =
                new FileInfo(
                        "test.pdf",
                        File.separator + "tmp" + File.separator + "test.pdf",
                        LocalDateTime.now(),
                        1234,
                        LocalDateTime.now().minusDays(2));
        assertEquals(
                File.separator + "tmp" + File.separator + "test.pdf",
                fileInfo.getFilePathAsPath().toString());
    }

    @Test
    void testGetFormattedModificationDate() {
        LocalDateTime modDate = LocalDateTime.of(2024, 6, 1, 15, 30, 45);
        FileInfo fileInfo =
                new FileInfo(
                        "file.txt",
                        File.separator + "file.txt",
                        modDate,
                        100,
                        LocalDateTime.of(2024, 5, 31, 10, 0, 0));
        assertEquals("2024-06-01 15:30:45", fileInfo.getFormattedModificationDate());
    }

    @Test
    void testGetFormattedCreationDate() {
        LocalDateTime creationDate = LocalDateTime.of(2023, 12, 25, 8, 15, 0);
        FileInfo fileInfo =
                new FileInfo(
                        "holiday.txt",
                        File.separator + "holiday.txt",
                        LocalDateTime.of(2024, 1, 1, 0, 0, 0),
                        500,
                        creationDate);
        assertEquals("2023-12-25 08:15:00", fileInfo.getFormattedCreationDate());
    }

    @Test
    void testGettersAndSetters() {
        LocalDateTime now = LocalDateTime.now();
        FileInfo fileInfo =
                new FileInfo(
                        "doc.pdf",
                        File.separator + "docs" + File.separator + "doc.pdf",
                        now,
                        2048,
                        now.minusDays(1));
        // Test getters
        assertEquals("doc.pdf", fileInfo.getFileName());
        assertEquals(File.separator + "docs" + File.separator + "doc.pdf", fileInfo.getFilePath());
        assertEquals(now, fileInfo.getModificationDate());
        assertEquals(2048, fileInfo.getFileSize());
        assertEquals(now.minusDays(1), fileInfo.getCreationDate());

        // Test setters
        fileInfo.setFileName("new.pdf");
        fileInfo.setFilePath(File.separator + "new" + File.separator + "new.pdf");
        fileInfo.setModificationDate(now.plusDays(1));
        fileInfo.setFileSize(4096);
        fileInfo.setCreationDate(now.minusDays(2));

        assertEquals("new.pdf", fileInfo.getFileName());
        assertEquals(File.separator + "new" + File.separator + "new.pdf", fileInfo.getFilePath());
        assertEquals(now.plusDays(1), fileInfo.getModificationDate());
        assertEquals(4096, fileInfo.getFileSize());
        assertEquals(now.minusDays(2), fileInfo.getCreationDate());
    }
}
