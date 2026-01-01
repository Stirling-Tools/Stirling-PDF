package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

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

    private static final ScheduledExecutorService cleanupExecutor =
            Executors.newScheduledThreadPool(
                    2,
                    r -> {
                        Thread t = new Thread(r, "temp-file-cleanup");
                        t.setDaemon(true);
                        return t;
                    });

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

        if (!Files.exists(path)) {
            outputTempFile.close(); // Clean up the temp file reference
            throw new IOException("Temporary file no longer exists: " + path.toString());
        }

        long len = Files.size(path);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(mediaType);
        headers.setContentLength(len);
        headers.add(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + docName + "\"");

        StreamingResponseBody body =
                os -> {
                    try (os) {
                        if (!Files.exists(path)) {
                            throw new IOException(
                                    "Temporary file was deleted before response could be sent: "
                                            + path.toString());
                        }
                        Files.copy(path, os);
                        os.flush();
                    } catch (Exception e) {
                        log.error("Error streaming file response for: {}", path, e);
                        throw e;
                    } finally {
                        cleanupExecutor.schedule(
                                () -> {
                                    try {
                                        outputTempFile.close();
                                        log.debug(
                                                "Cleaned up streaming response temp file: {}",
                                                path);
                                    } catch (Exception e) {
                                        log.warn(
                                                "Error closing temp file during delayed cleanup: {}",
                                                path,
                                                e);
                                    }
                                },
                                30,
                                TimeUnit.SECONDS); // Delay cleanup by 30 seconds
                    }
                };

        return new ResponseEntity<>(body, headers, HttpStatus.OK);
    }
}
