package stirling.software.common.util;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import lombok.extern.slf4j.Slf4j;

/**
 * {@link Resource} backed by a {@link TempFile}, with an optional auto-delete-on-close lifecycle.
 *
 * <p>Two flavours are exposed via static factories:
 *
 * <ul>
 *   <li>{@link #managed(TempFile)} — single-use. {@link #getInputStream()} wraps the stream so the
 *       backing {@link TempFile} is deleted when the stream is closed. Intended for terminal
 *       consumers (e.g. Spring's {@code ResourceHttpMessageConverter} writing an HTTP response
 *       body). Callers that need to re-read the body must copy it first.
 *   <li>{@link #unmanaged(TempFile, String)} — multi-use. {@link #getInputStream()} returns the
 *       plain file stream without attaching cleanup. The backing file lives until an external owner
 *       (typically {@link TempFileRegistry}'s background sweep or an explicit pipeline tracker)
 *       deletes it. Intended for intermediate results that need to be read more than once — for
 *       example the body of an internal API call that will be streamed as input into the next
 *       pipeline step.
 * </ul>
 *
 * <p>When a display filename is supplied (typically parsed from an upstream response's {@code
 * Content-Disposition} header), it is returned from {@link #getFilename()} instead of the
 * underlying temp file's path-based name.
 *
 * <p><b>Managed-mode failure handling:</b> if {@code super.getInputStream()} throws while opening
 * the file, the backing {@link TempFile} is closed before the exception propagates so we never leak
 * temp files along the error path. Read failures mid-body are logged and rethrown — they do not
 * suppress the cleanup performed on {@link InputStream#close()}.
 */
@Slf4j
public class TempFileBackedResource extends FileSystemResource {

    private final TempFile tempFile;
    private final String displayFilename;
    private final boolean autoDeleteOnClose;

    /**
     * Create a managed resource whose backing temp file is deleted when the returned input stream
     * is closed.
     */
    public static TempFileBackedResource managed(TempFile tempFile) {
        return new TempFileBackedResource(tempFile, null, true);
    }

    /**
     * Create an unmanaged resource. The returned input stream leaves the backing temp file in place
     * on close; lifetime is the caller's responsibility.
     */
    public static TempFileBackedResource unmanaged(TempFile tempFile) {
        return new TempFileBackedResource(tempFile, null, false);
    }

    /**
     * Create an unmanaged resource with a display filename returned from {@link #getFilename()}.
     */
    public static TempFileBackedResource unmanaged(TempFile tempFile, String displayFilename) {
        return new TempFileBackedResource(tempFile, displayFilename, false);
    }

    private TempFileBackedResource(
            TempFile tempFile, String displayFilename, boolean autoDeleteOnClose) {
        super(tempFile.getFile());
        this.tempFile = tempFile;
        this.displayFilename = displayFilename;
        this.autoDeleteOnClose = autoDeleteOnClose;
    }

    public TempFile getTempFile() {
        return tempFile;
    }

    @Override
    public String getFilename() {
        return displayFilename != null ? displayFilename : super.getFilename();
    }

    @Override
    public InputStream getInputStream() throws IOException {
        if (!autoDeleteOnClose) {
            return super.getInputStream();
        }
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
