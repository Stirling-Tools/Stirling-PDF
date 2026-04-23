package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

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
        headers.setContentDispositionFormData("attachment", encodeAttachmentName(docName));
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

        return baosToWebResponse(baos, docName);
    }

    /**
     * Save a {@link PDDocument} to a managed temp file and return it as a file-backed {@code
     * ResponseEntity<Resource>}.
     *
     * <p>The returned {@link Resource} owns the supplied {@link TempFile} — the file is deleted
     * when Spring closes the response {@link InputStream} after writing the body. This is a
     * synchronous equivalent of the previous {@code StreamingResponseBody} pattern and avoids the
     * async-dispatch hazards (response-committed races, filter incompatibility, silent write
     * failures) that {@code StreamingResponseBody} introduced.
     */
    public static ResponseEntity<Resource> pdfDocToWebResponse(
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

    /**
     * Convert a {@link TempFile} holding a PDF into a web response.
     *
     * <p>The temp file is deleted when Spring closes the response body stream.
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @return A ResponseEntity whose body streams the file, deleting it on close.
     */
    public static ResponseEntity<Resource> pdfFileToWebResponse(
            TempFile outputTempFile, String docName) throws IOException {
        return fileToWebResponse(outputTempFile, docName, MediaType.APPLICATION_PDF);
    }

    /**
     * Convert a {@link TempFile} holding a ZIP archive into a web response.
     *
     * <p>The temp file is deleted when Spring closes the response body stream.
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @return A ResponseEntity whose body streams the file, deleting it on close.
     */
    public static ResponseEntity<Resource> zipFileToWebResponse(
            TempFile outputTempFile, String docName) throws IOException {
        return fileToWebResponse(outputTempFile, docName, MediaType.APPLICATION_OCTET_STREAM);
    }

    /**
     * Convert a {@link TempFile} into a web response with an explicit media type.
     *
     * <p>The returned {@link ResponseEntity} carries a {@link TempFileBackedResource} (managed
     * flavour) as its body. Spring's {@code ResourceHttpMessageConverter} calls {@link
     * Resource#getInputStream()} once and closes the returned stream after writing — at which point
     * the underlying {@link TempFile} is deleted. Everything runs synchronously on the request
     * thread, so write failures propagate through normal Spring error handling and are logged,
     * rather than silently truncating the response.
     *
     * @param outputTempFile The temporary file to be sent as a response.
     * @param docName The name of the document.
     * @param mediaType The content type to set on the response.
     * @return A ResponseEntity whose body streams the file, deleting it on close.
     */
    public static ResponseEntity<Resource> fileToWebResponse(
            TempFile outputTempFile, String docName, MediaType mediaType) throws IOException {

        try {
            Path path = outputTempFile.getFile().toPath().normalize();
            long len = Files.size(path);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(mediaType);
            headers.setContentLength(len);
            headers.setContentDispositionFormData("attachment", encodeAttachmentName(docName));

            Resource body = TempFileBackedResource.managed(outputTempFile);
            return new ResponseEntity<>(body, headers, HttpStatus.OK);
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
}
