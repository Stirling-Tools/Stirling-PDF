package stirling.software.saas.payg.filter;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Tees the controller's response body so the PAYG interceptor can hash it for OUTPUT lineage
 * recording. Writes still flow through to the real client output stream unmodified — the wrapper
 * just keeps a parallel copy.
 *
 * <p>Memory model: bytes accumulate in an in-memory {@link ByteArrayOutputStream} until the
 * configured {@code in-memory-threshold-bytes} is crossed; after that the wrapper spills the
 * existing buffer plus all subsequent writes to a {@link TempFile} owned by {@link
 * TempFileManager}. Tiny responses (error JSONs, small PDFs) stay entirely in RAM with zero disk
 * IO; large responses (split-to-ZIP, big compressed PDFs) spill cleanly. See design doc §8.
 *
 * <p>The interceptor calls {@link #materialisedPath()} from {@code afterCompletion} to get a {@code
 * Path} suitable for the lineage detector + ZIP unpack. The wrapper guarantees a Path even if the
 * response stayed in memory — it materialises the buffer to a {@link TempFile} on demand so callers
 * have a uniform file-based interface.
 *
 * <p>{@link #close()} closes any {@link TempFile} the wrapper created. Callers MUST invoke close in
 * a finally — typically the interceptor's {@code afterCompletion} after it's done hashing.
 *
 * <p><b>Thread safety:</b> all mutating methods (record paths, materialisedPath, close,
 * resetBuffer) synchronize on the wrapper instance. The Servlet spec serialises controller writes
 * onto a single dispatch thread, but the {@link jakarta.servlet.AsyncListener#onComplete} callback
 * that closes the wrapper for async controllers runs on a container thread distinct from the
 * dispatch thread that produced the body. The synchronization makes that handoff safe and also
 * guards against future callers (e.g. tests) that might invoke {@link #materialisedPath} or {@link
 * #close} from a non-dispatch thread.
 */
@Slf4j
public class PaygResponseBodyWrapper extends HttpServletResponseWrapper implements AutoCloseable {

    private final TempFileManager tempFileManager;
    private final long inMemoryThresholdBytes;

    /** Lazily-created on the first getOutputStream() / getWriter() call. */
    private TeeingServletOutputStream teeOut;

    private PrintWriter writer;

    /**
     * In-memory accumulator until the threshold is crossed. Becomes null after spill (helps GC of
     * potentially large buffers).
     */
    private ByteArrayOutputStream memoryBuffer = new ByteArrayOutputStream();

    /** Non-null once we've spilled. Owns the {@link TempFile} below. */
    private OutputStream spillStream;

    /** Non-null once we've spilled, OR once {@link #materialisedPath()} forced materialisation. */
    private TempFile spillFile;

    private long bytesWritten;
    private boolean spilled;

    public PaygResponseBodyWrapper(
            HttpServletResponse response,
            TempFileManager tempFileManager,
            long inMemoryThresholdBytes) {
        super(response);
        this.tempFileManager = Objects.requireNonNull(tempFileManager, "tempFileManager");
        if (inMemoryThresholdBytes < 0) {
            throw new IllegalArgumentException(
                    "inMemoryThresholdBytes must be >= 0, got " + inMemoryThresholdBytes);
        }
        this.inMemoryThresholdBytes = inMemoryThresholdBytes;
    }

    @Override
    public ServletOutputStream getOutputStream() throws IOException {
        if (writer != null) {
            // Servlet spec: getOutputStream() and getWriter() are mutually exclusive per request.
            throw new IllegalStateException(
                    "getWriter() was already called on this response; cannot switch to getOutputStream()");
        }
        if (teeOut == null) {
            teeOut = new TeeingServletOutputStream(super.getOutputStream());
        }
        return teeOut;
    }

    @Override
    public PrintWriter getWriter() throws IOException {
        if (teeOut != null) {
            throw new IllegalStateException(
                    "getOutputStream() was already called on this response; cannot switch to getWriter()");
        }
        if (writer == null) {
            String encoding = getCharacterEncoding() != null ? getCharacterEncoding() : "UTF-8";
            // Wrap super.getOutputStream() directly with our TeeingServletOutputStream so writes
            // through the Writer path also get tee'd. The Writer just adds character→byte encoding.
            teeOut = new TeeingServletOutputStream(super.getOutputStream());
            writer = new PrintWriter(new OutputStreamWriter(teeOut, encoding));
        }
        return writer;
    }

    @Override
    public synchronized void resetBuffer() {
        super.resetBuffer();
        if (memoryBuffer != null) {
            memoryBuffer.reset();
        }
        // If we'd already spilled, the only safe move is to abandon the spill file: the client
        // hasn't seen the body yet (otherwise resetBuffer would be illegal), but our tee captured
        // bytes we now want to forget.
        if (spilled) {
            closeSpillQuietly();
            spillFile = null;
            spillStream = null;
            spilled = false;
            memoryBuffer = new ByteArrayOutputStream();
        }
        bytesWritten = 0;
    }

    /**
     * Returns a {@link Path} containing the full response body, or {@code null} if no bytes were
     * written. The returned path is owned by this wrapper — do NOT delete or modify it. Use {@link
     * #close()} to release.
     *
     * <p>If the response stayed under the threshold, this materialises the in-memory buffer to a
     * {@link TempFile} on demand so the caller always gets a file-based handle (uniform with the
     * spilled path).
     */
    public synchronized Path materialisedPath() throws IOException {
        if (bytesWritten == 0) {
            return null;
        }
        // Flush the writer so any character data lands in the underlying byte stream first.
        if (writer != null) {
            writer.flush();
        }
        if (spilled) {
            spillStream.flush();
            return spillFile.getPath();
        }
        // Stayed in memory — materialise on demand for a uniform Path-based interface.
        if (spillFile == null) {
            spillFile = tempFileManager.createManagedTempFile(".body");
            Files.write(spillFile.getPath(), memoryBuffer.toByteArray());
        }
        return spillFile.getPath();
    }

    public synchronized long bytesWritten() {
        return bytesWritten;
    }

    @Override
    public synchronized void close() {
        closeSpillQuietly();
    }

    private void closeSpillQuietly() {
        if (spillStream != null) {
            try {
                spillStream.close();
            } catch (IOException e) {
                log.debug("Ignoring close error on spill stream: {}", e.getMessage());
            }
            spillStream = null;
        }
        if (spillFile != null) {
            spillFile.close(); // TempFile.close() deletes the file
            spillFile = null;
        }
    }

    /**
     * Routes bytes both to the real client output stream AND to our buffer (in-memory or spilled).
     * Writes are not re-batched — each call to the delegate corresponds exactly to one call here.
     */
    private final class TeeingServletOutputStream extends ServletOutputStream {

        private final ServletOutputStream delegate;

        TeeingServletOutputStream(ServletOutputStream delegate) {
            this.delegate = delegate;
        }

        @Override
        public void write(int b) throws IOException {
            delegate.write(b);
            recordSingleByte((byte) b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            delegate.write(b, off, len);
            recordRange(b, off, len);
        }

        @Override
        public void flush() throws IOException {
            delegate.flush();
            // Read spilled / spillStream under the outer monitor so we observe the publication
            // written by spillToDisk() on another thread. The writers (recordSingleByte,
            // recordRange, spillToDisk) already mutate these fields under
            // synchronized(PaygResponseBodyWrapper.this); without matching locking here the
            // JMM permits stale reads (false `spilled`, null `spillStream`) and Aikido AI
            // flagged that gap.
            synchronized (PaygResponseBodyWrapper.this) {
                if (spilled && spillStream != null) {
                    spillStream.flush();
                }
            }
        }

        @Override
        public void close() throws IOException {
            delegate.close();
            synchronized (PaygResponseBodyWrapper.this) {
                if (spilled && spillStream != null) {
                    spillStream.flush();
                }
            }
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setWriteListener(WriteListener writeListener) {
            delegate.setWriteListener(writeListener);
        }
    }

    private synchronized void recordSingleByte(byte b) throws IOException {
        if (spilled) {
            spillStream.write(b & 0xFF);
        } else if (bytesWritten + 1 > inMemoryThresholdBytes) {
            spillToDisk();
            spillStream.write(b & 0xFF);
        } else {
            memoryBuffer.write(b & 0xFF);
        }
        bytesWritten++;
    }

    private synchronized void recordRange(byte[] b, int off, int len) throws IOException {
        if (spilled) {
            spillStream.write(b, off, len);
        } else if (bytesWritten + len > inMemoryThresholdBytes) {
            // This write crosses the threshold. Spill the existing in-memory buffer, then write
            // this entire chunk to disk too — we don't bother splitting it for the sake of staying
            // exactly at the threshold. Going over by at most one chunk is fine.
            spillToDisk();
            spillStream.write(b, off, len);
        } else {
            memoryBuffer.write(b, off, len);
        }
        bytesWritten += len;
    }

    /** Spill stream buffer size — coalesces Tomcat's per-chunk syscalls into 64 KiB writes. */
    private static final int SPILL_BUFFER_SIZE = 64 * 1024;

    private void spillToDisk() throws IOException {
        spillFile = tempFileManager.createManagedTempFile(".body");
        // Wrap in BufferedOutputStream — without this every Tomcat chunk (default 8 KiB) was a
        // separate syscall to the temp file, which dominates wall-clock on big spilled responses.
        spillStream =
                new BufferedOutputStream(
                        Files.newOutputStream(spillFile.getPath()), SPILL_BUFFER_SIZE);
        memoryBuffer.writeTo(spillStream);
        memoryBuffer = null; // help GC of potentially large buffer
        spilled = true;
        log.debug(
                "PaygResponseBodyWrapper spilled to {} after {} bytes (threshold {})",
                spillFile.getPath(),
                bytesWritten,
                inMemoryThresholdBytes);
    }
}
