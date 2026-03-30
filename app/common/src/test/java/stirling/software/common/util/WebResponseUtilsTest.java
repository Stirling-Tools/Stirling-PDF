package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

class WebResponseUtilsTest {

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
}
