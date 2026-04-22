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
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

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
     * Save a {@link PDDocument} to a managed temp file and return it as a streamed web response.
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
     * <p>The returned {@link ResponseEntity} carries a {@link ManagedTempFileResource} as its body.
     * Spring's {@code ResourceHttpMessageConverter} calls {@link Resource#getInputStream()} once
     * and closes the returned stream after writing — at which point the underlying {@link TempFile}
     * is deleted. Everything runs synchronously on the request thread, so write failures propagate
     * through normal Spring error handling and are logged, rather than silently truncating the
     * response.
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

            Resource body = new ManagedTempFileResource(outputTempFile);
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

    /**
     * {@link Resource} backed by a {@link TempFile}. The underlying temp file is deleted when the
     * response {@code InputStream} is closed — i.e. after Spring has finished writing the body. Any
     * {@link IOException} during the copy bubbles up through Spring's normal error path so it is
     * logged and the client sees a proper HTTP error, rather than a silently-truncated response.
     */
    public static final class ManagedTempFileResource extends FileSystemResource {

        private final TempFile tempFile;

        public ManagedTempFileResource(TempFile tempFile) {
            super(tempFile.getFile());
            this.tempFile = tempFile;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            InputStream source;
            try {
                source = super.getInputStream();
            } catch (IOException e) {
                // Opening the input stream already failed; make sure we don't leak the temp file.
                try {
                    tempFile.close();
                } catch (Exception closeEx) {
                    e.addSuppressed(closeEx);
                }
                throw e;
            }
            return new ClosingInputStream(source, tempFile);
        }
    }

    /**
     * Stream wrapper that deletes its backing {@link TempFile} on close. Logs — but does not
     * swallow — any IOException that happens while reading the body, so upstream handlers can
     * surface the failure to the client.
     */
    private static final class ClosingInputStream extends FilterInputStream {

        private final TempFile tempFile;
        private boolean closed;

        ClosingInputStream(InputStream delegate, TempFile tempFile) {
            super(delegate);
            this.tempFile = tempFile;
        }

        @Override
        public int read() throws IOException {
            try {
                return super.read();
            } catch (IOException e) {
                log.error(
                        "Failed to read temp response body {} while streaming to client",
                        tempFile.getAbsolutePath(),
                        e);
                throw e;
            }
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            try {
                return super.read(b, off, len);
            } catch (IOException e) {
                log.error(
                        "Failed to read temp response body {} while streaming to client",
                        tempFile.getAbsolutePath(),
                        e);
                throw e;
            }
        }

        @Override
        public void close() throws IOException {
            if (closed) {
                return;
            }
            closed = true;
            try {
                super.close();
            } finally {
                try {
                    tempFile.close();
                } catch (Exception closeEx) {
                    log.warn(
                            "Failed to clean up temp file {} after streaming response",
                            tempFile.getAbsolutePath(),
                            closeEx);
                }
            }
        }
    }
}
