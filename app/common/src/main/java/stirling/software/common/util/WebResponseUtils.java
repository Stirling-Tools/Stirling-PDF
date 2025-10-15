package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class WebResponseUtils {

    public static ResponseEntity<byte[]> baosToWebResponse(
            ByteArrayOutputStream baos, String docName) throws IOException {
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), docName);
    }

    public static ResponseEntity<byte[]> baosToWebResponse(
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
                RegexPatternUtils.getInstance()
                        .getPlusSignPattern()
                        .matcher(URLEncoder.encode(docName, StandardCharsets.UTF_8))
                        .replaceAll("%20");
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
        document.close();

        return baosToWebResponse(baos, docName);
    }

    /**
     * Convert a File to a web response (PDF default).
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @return A ResponseEntity containing the file as a resource.
     */
    public static ResponseEntity<StreamingResponseBody> pdfFileToWebResponse(
            TempFile outputTempFile, String docName) throws IOException {
        return fileToWebResponse(outputTempFile, docName, MediaType.APPLICATION_PDF);
    }

    /**
     * Convert a File to a web response (ZIP default).
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @return A ResponseEntity containing the file as a resource.
     */
    public static ResponseEntity<StreamingResponseBody> zipFileToWebResponse(
            TempFile outputTempFile, String docName) throws IOException {
        return fileToWebResponse(outputTempFile, docName, MediaType.APPLICATION_OCTET_STREAM);
    }

    /**
     * Convert a File to a web response with explicit media type (e.g., ZIP).
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @param mediaType The content type to set on the response.
     * @return A ResponseEntity containing the file as a resource.
     */
    public static ResponseEntity<StreamingResponseBody> fileToWebResponse(
            TempFile outputTempFile, String docName, MediaType mediaType) throws IOException {

        Path path = outputTempFile.getFile().toPath().normalize();
        long len = Files.size(path);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentLength(len);
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + docName + "\"");

        StreamingResponseBody body =
                os -> {
                    try (os) {
                        Files.copy(path, os);
                        os.flush();
                    } finally {
                        outputTempFile.close();
                    }
                };

        return new ResponseEntity<>(body, headers, HttpStatus.OK);
    }
}
