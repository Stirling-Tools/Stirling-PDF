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

// TODO: Migration required - org.springframework.core.io.Resource/FileSystemResource have no
// JAX-RS drop-in. The file-backed responses below (pdfFileToWebResponse / zipFileToWebResponse /
// fileToWebResponse and the ManagedTempFileResource inner class) rely on Spring's
// ResourceHttpMessageConverter calling Resource#getInputStream() once and closing it after writing
// the body, which is what triggers TempFile deletion. Under Quarkus/JAX-RS the equivalent is to
// return a StreamingOutput (or InputStream) and delete the TempFile after the stream is fully
// written. The Spring Resource imports are retained until those methods are reworked, because
// removing them would require changing the public ResponseEntity<Resource> signatures and the
// converter-driven lifecycle they depend on.
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
// TODO: Migration required - org.springframework.web.multipart.MultipartFile has no servlet/JAX-RS
// drop-in for a utility method parameter. Converting multiPartFileToWebResponse to accept
// byte[]/InputStream would ripple through every caller, so the Spring type and its import are kept
// here intentionally.
import org.springframework.web.multipart.MultipartFile;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

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
        return fileToWebResponse(outputTempFile, docName, APPLICATION_PDF);
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
        return fileToWebResponse(
                outputTempFile, docName, MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
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
    // TODO: Migration required - ResponseEntity<Resource> + FileSystemResource depend on Spring's
    // ResourceHttpMessageConverter to invoke Resource#getInputStream() and close it after writing,
    // which is the hook that deletes the backing TempFile. There is no faithful JAX-RS drop-in for
    // that lifecycle; rework to return jakarta.ws.rs.core.Response carrying a StreamingOutput that
    // deletes the TempFile after writing. Left intact to preserve behaviour and the public
    // signature until callers can be migrated together.
    public static ResponseEntity<Resource> fileToWebResponse(
            TempFile outputTempFile, String docName, MediaType mediaType) throws IOException {

        try {
            Path path = outputTempFile.getFile().toPath().normalize();
            long len = Files.size(path);
            org.springframework.http.HttpHeaders headers =
                    new org.springframework.http.HttpHeaders();
            headers.setContentType(
                    org.springframework.http.MediaType.parseMediaType(mediaType.toString()));
            headers.setContentLength(len);
            headers.setContentDispositionFormData("attachment", encodeAttachmentName(docName));

            Resource body = new ManagedTempFileResource(outputTempFile);
            return new ResponseEntity<>(body, headers, org.springframework.http.HttpStatus.OK);
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
     * {@link IOException} during the copy is logged via {@link ClosingInputStream} and propagates
     * through Spring's normal error path. Since response headers are committed before the body
     * transfer begins, a mid-body failure manifests as a server-side log entry plus an aborted
     * connection rather than a silently-truncated success — which is the behaviour this class was
     * added to restore.
     *
     * <p><b>Single-use contract:</b> {@link #getInputStream()} is intended to be called once by
     * Spring's {@code ResourceHttpMessageConverter} on the normal write path. After the returned
     * stream is closed the backing temp file is deleted, so subsequent {@code getInputStream()}
     * calls will either see a deleted file (tests that mock {@link TempFile#close()} are an
     * exception) or fail at read time. Callers that need to re-read the body must copy it first.
     */
    // TODO: Migration required - extends Spring's FileSystemResource and is consumed by Spring's
    // ResourceHttpMessageConverter; no JAX-RS equivalent. Kept intact pending the Response +
    // StreamingOutput rework described on fileToWebResponse.
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
