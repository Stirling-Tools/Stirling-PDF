package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import stirling.software.common.model.ApplicationProperties;

class WebResponseUtilsTest {

    @TempDir Path tempDir;

    private TempFileManager tempFileManager;

    @BeforeEach
    void setUpTempFileManager() {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("wru-test-");
        tempFileManager = new TempFileManager(registry, applicationProperties);
    }

    @Test
    void testBytesToWebResponse_defaultMediaType() throws IOException {
        byte[] data = "test content".getBytes(StandardCharsets.UTF_8);
        ResponseEntity<byte[]> response = WebResponseUtils.bytesToWebResponse(data, "output.pdf");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
        assertEquals(data.length, response.getHeaders().getContentLength());
        assertArrayEquals(data, response.getBody());
    }

    @Test
    void testBytesToWebResponse_customMediaType() throws IOException {
        byte[] data = "zip data".getBytes(StandardCharsets.UTF_8);
        ResponseEntity<byte[]> response =
                WebResponseUtils.bytesToWebResponse(
                        data, "output.zip", MediaType.APPLICATION_OCTET_STREAM);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_OCTET_STREAM, response.getHeaders().getContentType());
        assertArrayEquals(data, response.getBody());
    }

    @Test
    void testBaosToWebResponse() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write("baos content".getBytes(StandardCharsets.UTF_8));

        ResponseEntity<byte[]> response = WebResponseUtils.baosToWebResponse(baos, "doc.pdf");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("baos content", new String(response.getBody(), StandardCharsets.UTF_8));
    }

    @Test
    void testBaosToWebResponse_withMediaType() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write("data".getBytes(StandardCharsets.UTF_8));

        ResponseEntity<byte[]> response =
                WebResponseUtils.baosToWebResponse(baos, "doc.html", MediaType.TEXT_HTML);

        assertEquals(MediaType.TEXT_HTML, response.getHeaders().getContentType());
    }

    @Test
    void testBytesToWebResponse_contentDispositionHeader() throws IOException {
        byte[] data = "test".getBytes(StandardCharsets.UTF_8);
        ResponseEntity<byte[]> response = WebResponseUtils.bytesToWebResponse(data, "my file.pdf");

        String contentDisposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.contains("attachment"));
    }

    @Test
    void testBytesToWebResponse_specialCharsInFilename() throws IOException {
        byte[] data = "test".getBytes(StandardCharsets.UTF_8);
        // A space in the filename gets URL-encoded to '+' then replaced with '%20'
        ResponseEntity<byte[]> response =
                WebResponseUtils.bytesToWebResponse(data, "file name.pdf");

        String contentDisposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(contentDisposition);
        // The space in filename should be encoded as %20 (not +)
        assertTrue(contentDisposition.contains("%20"));
    }

    @Test
    void testBytesToWebResponse_emptyBytes() throws IOException {
        byte[] data = new byte[0];
        ResponseEntity<byte[]> response = WebResponseUtils.bytesToWebResponse(data, "empty.pdf");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(0, response.getHeaders().getContentLength());
    }

    @Test
    void managedTempFileResource_happyPathDeletesBackingFile() throws IOException {
        // Create a real managed temp file on disk and populate it.
        TempFile tempFile = tempFileManager.createManagedTempFile(".pdf");
        byte[] payload = "fully-readable-pdf-body".getBytes(StandardCharsets.UTF_8);
        Files.write(tempFile.getPath(), payload);
        File backing = tempFile.getFile();
        assertTrue(backing.exists(), "precondition: backing file should exist");

        WebResponseUtils.ManagedTempFileResource resource =
                new WebResponseUtils.ManagedTempFileResource(tempFile);

        byte[] readBack;
        try (InputStream in = resource.getInputStream()) {
            readBack = in.readAllBytes();
        }

        assertArrayEquals(payload, readBack, "stream should deliver the original bytes");
        assertFalse(
                backing.exists(),
                "backing temp file must be deleted once the response stream is closed");
    }

    @Test
    void closingInputStream_propagatesReadFailure() throws IOException {
        // ManagedTempFileResource is final, so we can't swap in a mock underlying stream.
        // Instead: open the resource's stream, close the inner FileInputStream early
        // (by closing the outer stream once), then confirm reading the now-closed stream
        // throws — exercising ClosingInputStream's read() catch/log/rethrow path. Finally
        // confirm the temp file is still cleaned up on close().
        TempFile tempFile = tempFileManager.createManagedTempFile(".pdf");
        Files.write(tempFile.getPath(), "some-bytes".getBytes(StandardCharsets.UTF_8));
        File backing = tempFile.getFile();
        assertTrue(backing.exists());

        WebResponseUtils.ManagedTempFileResource resource =
                new WebResponseUtils.ManagedTempFileResource(tempFile);

        InputStream in = resource.getInputStream();
        // Pre-close the underlying stream to guarantee read() throws.
        in.close();
        // After close, the temp file has been deleted already.
        assertFalse(
                backing.exists(),
                "backing file is deleted on first close — precondition for read assertion");

        // Any attempt to read from the already-closed stream must throw IOException
        // (not silently return -1). This exercises the ClosingInputStream.read() path
        // that logs and rethrows.
        IOException ioex = assertThrows(IOException.class, in::read);
        assertNotNull(ioex);

        // close() is idempotent — a second call must not throw.
        assertDoesNotThrow(in::close);
    }

    @Test
    void managedTempFileResource_openFailureCleansUp() throws IOException {
        // Arrange: build a TempFile whose backing file is deleted out from under it so
        // super.getInputStream() throws on open. Instrument close() with an AtomicBoolean
        // hook to confirm the cleanup path ran.
        AtomicBoolean closed = new AtomicBoolean(false);
        TempFile spying =
                new TempFile(tempFileManager, ".pdf") {
                    @Override
                    public void close() {
                        closed.set(true);
                        super.close();
                    }
                };
        assertTrue(
                spying.getFile().delete(),
                "precondition: delete backing so super.getInputStream() fails");

        WebResponseUtils.ManagedTempFileResource resource =
                new WebResponseUtils.ManagedTempFileResource(spying);

        assertThrows(IOException.class, resource::getInputStream);
        assertTrue(
                closed.get(),
                "tempFile.close() must run when super.getInputStream() fails on open");
    }
}
