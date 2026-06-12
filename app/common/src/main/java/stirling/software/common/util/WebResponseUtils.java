package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;

import stirling.software.common.model.MultipartFile;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class WebResponseUtils {

    private static final MediaType APPLICATION_PDF = MediaType.valueOf("application/pdf");

    public static Response baosToWebResponse(ByteArrayOutputStream baos, String docName)
            throws IOException {
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), docName);
    }

    public static Response baosToWebResponse(
            ByteArrayOutputStream baos, String docName, MediaType mediaType) throws IOException {
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), docName, mediaType);
    }

    public static Response multiPartFileToWebResponse(MultipartFile file) throws IOException {
        String fileName = Filenames.toSimpleFileName(file.getOriginalFilename());
        MediaType mediaType = MediaType.valueOf(file.getContentType());

        byte[] bytes = file.getBytes();

        return bytesToWebResponse(bytes, fileName, mediaType);
    }

    public static Response bytesToWebResponse(byte[] bytes, String docName, MediaType mediaType)
            throws IOException {

        // Return the PDF as a response
        return Response.ok(bytes)
                .type(mediaType)
                .header(HttpHeaders.CONTENT_LENGTH, bytes.length)
                .header(
                        "Content-Disposition",
                        "form-data; name=\"attachment\"; filename=\""
                                + encodeAttachmentName(docName)
                                + "\"")
                .build();
    }

    public static Response bytesToWebResponse(byte[] bytes, String docName) throws IOException {
        return bytesToWebResponse(bytes, docName, APPLICATION_PDF);
    }

    public static Response pdfDocToWebResponse(PDDocument document, String docName)
            throws IOException {

        // Open Byte Array and save document to it
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);

        return baosToWebResponse(baos, docName);
    }

    /**
     * Save a {@link PDDocument} to a managed temp file and return it as a streamed web response.
     *
     * <p>MIGRATION (Spring -> JAX-RS): previously returned {@code ResponseEntity<Resource>} backed
     * by a {@code ManagedTempFileResource}, relying on Spring's {@code ResourceHttpMessageConverter}
     * to call {@code Resource#getInputStream()} and close it after writing (the hook that deleted
     * the {@link TempFile}). The JAX-RS equivalent is a {@link StreamingOutput} that copies the file
     * to the response and deletes the temp file in a {@code finally} block once writing completes.
     */
    public static Response pdfDocToWebResponse(
            PDDocument document, String docName, TempFileManager tempFileManager)
            throws IOException {
        TempFile tempFile = tempFileManager.createManagedTempFile(".pdf");
        try {
            document.save(tempFile.getFile());
        } catch (IOException e) {
            tempFile.close();
            throw e;
        }
        return pdfFileToWebResponse(tempFile, docName);
    }

    /** Convert a {@link TempFile} holding a PDF into a streamed web response (deletes on close). */
    public static Response pdfFileToWebResponse(TempFile outputTempFile, String docName)
            throws IOException {
        return fileToWebResponse(outputTempFile, docName, APPLICATION_PDF);
    }

    /** Convert a {@link TempFile} holding a ZIP into a streamed web response (deletes on close). */
    public static Response zipFileToWebResponse(TempFile outputTempFile, String docName)
            throws IOException {
        return fileToWebResponse(
                outputTempFile, docName, MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
    }

    /**
     * Convert a {@link TempFile} into a streamed web response with an explicit media type.
     *
     * <p>The body is a {@link StreamingOutput} that copies the temp file to the client and deletes
     * the backing {@link TempFile} once the transfer completes (or fails). This replaces the former
     * Spring {@code ResponseEntity<Resource>} + {@code ResourceHttpMessageConverter} lifecycle.
     * I/O errors during the copy are logged and propagated.
     */
    public static Response fileToWebResponse(
            TempFile outputTempFile, String docName, MediaType mediaType) throws IOException {

        try {
            Path path = outputTempFile.getFile().toPath().normalize();
            long len = Files.size(path);

            StreamingOutput body =
                    output -> {
                        try (InputStream in = Files.newInputStream(path)) {
                            in.transferTo(output);
                        } catch (IOException e) {
                            log.error(
                                    "Failed to stream temp response body {} to client",
                                    outputTempFile.getAbsolutePath(),
                                    e);
                            throw e;
                        } finally {
                            try {
                                outputTempFile.close();
                            } catch (Exception closeEx) {
                                log.warn(
                                        "Failed to clean up temp file {} after streaming response",
                                        outputTempFile.getAbsolutePath(),
                                        closeEx);
                            }
                        }
                    };

            return Response.ok(body)
                    .type(mediaType)
                    .header(HttpHeaders.CONTENT_LENGTH, len)
                    .header(
                            "Content-Disposition",
                            "attachment; filename=\"" + encodeAttachmentName(docName) + "\"")
                    .build();
        } catch (IOException | RuntimeException e) {
            try {
                outputTempFile.close();
            } catch (Exception closeEx) {
                e.addSuppressed(closeEx);
            }
            throw e;
        }
    }

    private static String encodeAttachmentName(String docName) {
        return RegexPatternUtils.getInstance()
                .getPlusSignPattern()
                .matcher(URLEncoder.encode(docName, StandardCharsets.UTF_8))
                .replaceAll("%20");
    }

    // REMOVED (Spring -> JAX-RS): ManagedTempFileResource (extended Spring FileSystemResource) and
    // ClosingInputStream. Their job - delete the TempFile after the response body is written - is now
    // done inline by the StreamingOutput's finally block in fileToWebResponse, which is the idiomatic
    // JAX-RS lifecycle and removes the dependency on Spring's ResourceHttpMessageConverter.
}
