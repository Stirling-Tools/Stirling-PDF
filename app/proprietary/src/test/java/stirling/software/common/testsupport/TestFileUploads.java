package stirling.software.common.testsupport;

import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.jboss.resteasy.reactive.multipart.FileUpload;

/**
 * Builds RESTEasy Reactive {@link FileUpload} stubs for unit tests. The migrated controllers bind
 * {@code @RestForm FileUpload} and wrap it via {@code FileUploadMultipartFile.of(...)}, which reads
 * {@code uploadedFile()}/{@code fileName()}/{@code size()}. This backs the mock with a real temp
 * file so those reads work whether or not the collaborator (e.g. {@code CustomPDFDocumentFactory})
 * is itself mocked. All stubs are lenient so a test that never reaches a given accessor does not
 * trip strict-stubbing.
 *
 * <p>Duplicated per-module (also in {@code :stirling-pdf}) because module test source sets do not
 * share sources - same approach already used for {@code ReflectionTestUtils}.
 */
public final class TestFileUploads {

    private TestFileUploads() {}

    public static FileUpload of(byte[] content, String fileName, String contentType) {
        try {
            byte[] bytes = content == null ? new byte[0] : content;
            String suffix = fileName == null ? "file" : fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
            Path tmp = Files.createTempFile("test-upload-", "-" + suffix);
            tmp.toFile().deleteOnExit();
            Files.write(tmp, bytes);

            FileUpload upload = mock(FileUpload.class);
            lenient().when(upload.uploadedFile()).thenReturn(tmp);
            lenient().when(upload.filePath()).thenReturn(tmp);
            lenient().when(upload.fileName()).thenReturn(fileName);
            lenient().when(upload.contentType()).thenReturn(contentType);
            lenient().when(upload.size()).thenReturn((long) bytes.length);
            return upload;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Convenience for a PDF part named {@code test.pdf}. */
    public static FileUpload pdf(byte[] content) {
        return of(content, "test.pdf", "application/pdf");
    }
}
