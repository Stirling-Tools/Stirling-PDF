package stirling.software.proprietary.integration.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class ResultFilesTest {

    @TempDir Path tempDir;

    private TempFileManager tempFileManager;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        tempFileManager = new TempFileManager(new TempFileRegistry(), props);
    }

    @Test
    void selectedEntryOutlivesTheUnpackedArchive() throws IOException {
        Resource archive = ResultFiles.asResource(zipOf("cover.txt", "signed.pdf"), "bundle.zip");

        Resource selected = ResultFiles.selectFromArchive(archive, "*.pdf", tempFileManager);

        assertEquals("signed.pdf", selected.getFilename());
        assertEquals("signed.pdf content", selected.getContentAsString(StandardCharsets.UTF_8));
        assertNoTempFilesLeft();
    }

    @Test
    void unpackedArchiveIsDeletedWhenNothingMatches() throws IOException {
        Resource archive = ResultFiles.asResource(zipOf("cover.txt"), "bundle.zip");

        assertThrows(
                IOException.class,
                () -> ResultFiles.selectFromArchive(archive, "*.pdf", tempFileManager));
        assertNoTempFilesLeft();
    }

    private void assertNoTempFilesLeft() throws IOException {
        try (Stream<Path> left = Files.list(tempDir)) {
            assertEquals(0, left.count());
        }
    }

    private static byte[] zipOf(String... names) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (String name : names) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write((name + " content").getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }
}
