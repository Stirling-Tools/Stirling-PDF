package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("WebResponseUtils Tests")
public class WebResponseUtilsTest {

    @Nested
    @DisplayName("ByteArrayOutputStream to Web Response Tests")
    class BoasToWebResponseTests {

        @Test
        @DisplayName("Converts ByteArrayOutputStream to PDF web response with correct headers")
        public void testBoasToWebResponse() {
            try {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                baos.write("Sample PDF content".getBytes());
                String docName = "sample.pdf";

                ResponseEntity<byte[]> responseEntity =
                        WebResponseUtils.baosToWebResponse(baos, docName);

                assertNotNull(responseEntity, "ResponseEntity should not be null");
                assertEquals(
                        HttpStatus.OK, responseEntity.getStatusCode(), "Status code should be OK");
                assertNotNull(responseEntity.getBody(), "Response body should not be null");

                HttpHeaders headers = responseEntity.getHeaders();
                assertNotNull(headers, "Headers should not be null");
                assertEquals(
                        MediaType.APPLICATION_PDF,
                        headers.getContentType(),
                        "Content type should be PDF");
                assertNotNull(
                        headers.getContentDisposition(),
                        "Content disposition header should be present");
            } catch (IOException e) {
                fail("Exception thrown during test: " + e.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("MultipartFile to Web Response Tests")
    class MultiPartFileToWebResponseTests {

        @Test
        @DisplayName("Converts MockMultipartFile to text web response with correct headers")
        public void testMultiPartFileToWebResponse() {
            try {
                byte[] fileContent = "Sample file content".getBytes();
                MockMultipartFile file =
                        new MockMultipartFile("file", "sample.txt", "text/plain", fileContent);

                ResponseEntity<byte[]> responseEntity =
                        WebResponseUtils.multiPartFileToWebResponse(file);

                assertNotNull(responseEntity, "ResponseEntity should not be null");
                assertEquals(
                        HttpStatus.OK, responseEntity.getStatusCode(), "Status code should be OK");
                assertNotNull(responseEntity.getBody(), "Response body should not be null");

                HttpHeaders headers = responseEntity.getHeaders();
                assertNotNull(headers, "Headers should not be null");
                assertEquals(
                        MediaType.TEXT_PLAIN,
                        headers.getContentType(),
                        "Content type should be text/plain");
                assertNotNull(
                        headers.getContentDisposition(),
                        "Content disposition header should be present");
            } catch (IOException e) {
                fail("Exception thrown during test: " + e.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("Byte Array to Web Response Tests")
    class BytesToWebResponseTests {

        @Test
        @DisplayName("Creates web response from byte array with correct content type and headers")
        public void testBytesToWebResponse() {
            try {
                byte[] bytes = "Sample bytes".getBytes();
                String docName = "sample.txt";
                MediaType mediaType = MediaType.TEXT_PLAIN;

                ResponseEntity<byte[]> responseEntity =
                        WebResponseUtils.bytesToWebResponse(bytes, docName, mediaType);

                assertNotNull(responseEntity, "ResponseEntity should not be null");
                assertEquals(
                        HttpStatus.OK, responseEntity.getStatusCode(), "Status code should be OK");
                assertNotNull(responseEntity.getBody(), "Response body should not be null");

                HttpHeaders headers = responseEntity.getHeaders();
                assertNotNull(headers, "Headers should not be null");
                assertEquals(
                        MediaType.TEXT_PLAIN,
                        headers.getContentType(),
                        "Content type should be text/plain");
                assertNotNull(
                        headers.getContentDisposition(),
                        "Content disposition header should be present");
            } catch (IOException e) {
                fail("Exception thrown during test: " + e.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("PDDocument to Web Response Tests")
    class PdfDocToWebResponseTests {

        @Test
        @DisplayName("Converts PDDocument to PDF web response with correct headers")
        public void testPdfDocToWebResponse() {
            try {
                PDDocument document = new PDDocument();
                document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
                String docName = "sample.pdf";

                ResponseEntity<byte[]> responseEntity =
                        WebResponseUtils.pdfDocToWebResponse(document, docName);

                assertNotNull(responseEntity, "ResponseEntity should not be null");
                assertEquals(
                        HttpStatus.OK, responseEntity.getStatusCode(), "Status code should be OK");
                assertNotNull(responseEntity.getBody(), "Response body should not be null");

                HttpHeaders headers = responseEntity.getHeaders();
                assertNotNull(headers, "Headers should not be null");
                assertEquals(
                        MediaType.APPLICATION_PDF,
                        headers.getContentType(),
                        "Content type should be PDF");
                assertNotNull(
                        headers.getContentDisposition(),
                        "Content disposition header should be present");
                document.close();
            } catch (IOException e) {
                fail("Exception thrown during test: " + e.getMessage());
            }
        }
    }
}
