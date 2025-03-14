package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;

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
                        "/path/to/example.txt",
                        LocalDateTime.now(),
                        fileSize,
                        LocalDateTime.now().minusDays(1));

        assertEquals(expectedFormattedSize, fileInfo.getFormattedFileSize());
    }
}
