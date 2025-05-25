package stirling.software.SPDF.utils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

public class WebResponseUtils {

    public static ResponseEntity<byte[]> boasToWebResponse(
            ByteArrayOutputStream baos, String docName) throws IOException {
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), docName);
    }

    public static ResponseEntity<byte[]> boasToWebResponse(
            ByteArrayOutputStream baos, String docName, MediaType mediaType) throws IOException {
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), docName, mediaType);
    }

    public static ResponseEntity<byte[]> multiPartFileToWebResponse(MultipartFile file)
            throws IOException {
        String fileName = Filenames.toSimpleFileName(file.getOriginalFilename());
        MediaType mediaType = MediaType.parseMediaType(file.getContentType());

        byte[] bytes = file.getBytes();

        return bytesToWebResponse(bytes, fileName, mediaType);
    }

    public static ResponseEntity<byte[]> bytesToWebResponse(
            byte[] bytes, String docName, MediaType mediaType) throws IOException {

        // Return the PDF as a response
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentLength(bytes.length);
        String encodedDocName =
                URLEncoder.encode(docName, StandardCharsets.UTF_8.toString())
                        .replaceAll("\\+", "%20");
        headers.setContentDispositionFormData("attachment", encodedDocName);
        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    public static ResponseEntity<byte[]> bytesToWebResponse(byte[] bytes, String docName)
            throws IOException {
        return bytesToWebResponse(bytes, docName, MediaType.APPLICATION_PDF);
    }

    public static ResponseEntity<byte[]> pdfDocToWebResponse(PDDocument document, String docName)
            throws IOException {

        // Open Byte Array and save document to it
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        // Close the document
        document.close();

        return boasToWebResponse(baos, docName);
    }

    /**
     * Gets a response builder with appropriate headers for the given filename
     *
     * @param filename The filename to use in the Content-Disposition header
     * @return A ResponseEntity.BodyBuilder with appropriate headers
     * @throws IOException If encoding the filename fails
     */
    public static ResponseEntity.BodyBuilder getResponseBuilder(String filename)
            throws IOException {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        String encodedFilename =
                URLEncoder.encode(filename, StandardCharsets.UTF_8.toString())
                        .replaceAll("\\+", "%20");
        headers.setContentDispositionFormData("attachment", encodedFilename);

        return ResponseEntity.ok().headers(headers);
    }

    /**
     * Converts a PDDocument to a byte array
     *
     * @param document The PDDocument to convert
     * @return The document as a byte array
     * @throws IOException If saving the document fails
     */
    public static byte[] getBytesFromPDDocument(PDDocument document) throws IOException {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.save(baos);
            return baos.toByteArray();
        } finally {
            document.close();
        }
    }

    /**
     * Creates an error response with a message
     *
     * @param message The error message
     * @return A ResponseEntity with the error message
     */
    public static ResponseEntity<byte[]> errorResponseWithMessage(String message) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        String jsonError = "{\"error\":\"" + message.replace("\"", "\\\"") + "\"}";
        return new ResponseEntity<>(
                jsonError.getBytes(StandardCharsets.UTF_8), headers, HttpStatus.BAD_REQUEST);
    }
}
