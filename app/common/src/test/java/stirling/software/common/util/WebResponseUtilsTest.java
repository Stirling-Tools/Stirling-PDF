package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * MIGRATION (Spring -> JAX-RS): {@code WebResponseUtils} now returns {@link Response} instead of
 * {@code ResponseEntity<byte[]>}, and the {@code ManagedTempFileResource}/{@code
 * ClosingInputStream} inner classes were removed (their delete-on-close behaviour is now an
 * internal {@code StreamingOutput} finally block in {@code fileToWebResponse}, exercised by {@code
 * PDFToFileTest}). The byte/baos response builders are ported here against the JAX-RS API; the
 * removed-class tests no longer apply.
 */
class WebResponseUtilsTest {

    private static final String APPLICATION_PDF = "application/pdf";

    @Test
    void testBytesToWebResponse_defaultMediaType() throws IOException {
        byte[] data = "test content".getBytes(StandardCharsets.UTF_8);
        Response response = WebResponseUtils.bytesToWebResponse(data, "output.pdf");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.valueOf(APPLICATION_PDF), response.getMediaType());
        assertEquals(String.valueOf(data.length), response.getHeaderString("Content-Length"));
        assertArrayEquals(data, (byte[]) response.getEntity());
    }

    @Test
    void testBytesToWebResponse_customMediaType() throws IOException {
        byte[] data = "zip data".getBytes(StandardCharsets.UTF_8);
        Response response =
                WebResponseUtils.bytesToWebResponse(
                        data, "output.zip", MediaType.APPLICATION_OCTET_STREAM_TYPE);

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals(MediaType.APPLICATION_OCTET_STREAM_TYPE, response.getMediaType());
        assertArrayEquals(data, (byte[]) response.getEntity());
    }

    @Test
    void testBaosToWebResponse() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write("baos content".getBytes(StandardCharsets.UTF_8));

        Response response = WebResponseUtils.baosToWebResponse(baos, "doc.pdf");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertNotNull(response.getEntity());
        assertEquals(
                "baos content", new String((byte[]) response.getEntity(), StandardCharsets.UTF_8));
    }

    @Test
    void testBaosToWebResponse_withMediaType() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write("data".getBytes(StandardCharsets.UTF_8));

        Response response =
                WebResponseUtils.baosToWebResponse(baos, "doc.html", MediaType.TEXT_HTML_TYPE);

        assertEquals(MediaType.TEXT_HTML_TYPE, response.getMediaType());
    }

    @Test
    void testBytesToWebResponse_contentDispositionHeader() throws IOException {
        byte[] data = "test".getBytes(StandardCharsets.UTF_8);
        Response response = WebResponseUtils.bytesToWebResponse(data, "my file.pdf");

        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertNotNull(contentDisposition);
        assertTrue(contentDisposition.contains("attachment"));
    }

    @Test
    void testBytesToWebResponse_specialCharsInFilename() throws IOException {
        byte[] data = "test".getBytes(StandardCharsets.UTF_8);
        // A space in the filename gets URL-encoded to '+' then replaced with '%20'
        Response response = WebResponseUtils.bytesToWebResponse(data, "file name.pdf");

        String contentDisposition = response.getHeaderString("Content-Disposition");
        assertNotNull(contentDisposition);
        // The space in filename should be encoded as %20 (not +)
        assertTrue(contentDisposition.contains("%20"));
    }

    @Test
    void testBytesToWebResponse_emptyBytes() throws IOException {
        byte[] data = new byte[0];
        Response response = WebResponseUtils.bytesToWebResponse(data, "empty.pdf");

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        assertEquals("0", response.getHeaderString("Content-Length"));
    }
}
