package stirling.software.common.service;


import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.function.Consumer;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.examples.util.DeletingRandomAccessFile;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFileManager;

@Component
@Slf4j
public class CustomPDFDocumentFactory {

    private final PdfMetadataService pdfMetadataService;

    // TempFileManager is optional at construction time so that test code can instantiate this
    // class without a full Spring context. When null, falls back to Files.createTempFile().
    private final TempFileManager tempFileManager;

    /** Primary constructor used by Spring. Both collaborators are required in production. */
    public CustomPDFDocumentFactory(
            PdfMetadataService pdfMetadataService, TempFileManager tempFileManager) {
        this.pdfMetadataService = pdfMetadataService;
        this.tempFileManager = tempFileManager;
    }

    /**
     * Test-only convenience constructor. {@link TempFileManager} falls back to {@link
     * Files#createTempFile}.
     */
    public CustomPDFDocumentFactory(PdfMetadataService pdfMetadataService) {
        this(pdfMetadataService, null);
    }

    /** Documents ≤ this size are loaded entirely into heap — no temp files needed. */
    public static final long SMALL_FILE_THRESHOLD = 10L * 1024 * 1024; // 10 MB

    /** Upper boundary of the "mixed" memory+file zone; above this always file-backed. */
    private static final long LARGE_FILE_THRESHOLD = 50L * 1024 * 1024; // 50 MB

    /** Heap budget reserved for a document loaded in mixed mode. */
    private static final long MIXED_MODE_MEMORY_LIMIT = 10L * 1024 * 1024; // 10 MB

    /** Minimum free-heap fraction before falling back to file-backed caching. */
    private static final double MIN_FREE_MEMORY_PERCENTAGE = 30.0;

    /**
     * Absolute free-heap floor. Kept well below typical JVM heap sizes (256 MB) so that the
     * percentage gate above remains the primary trigger. The previous value of 4 GB caused
     * file-backed caching to fire on every request against any JVM with a heap smaller than 4 GB,
     * defeating the purpose of the threshold hierarchy entirely.
     */
    private static final long MIN_FREE_MEMORY_FLOOR = 256L * 1024 * 1024; // 256 MB

    /** Maximum number of concurrent PDF operations in batch methods. */
    private static final int MAX_CONCURRENT_OPS =
            Math.max(4, Runtime.getRuntime().availableProcessors());

    private static final Semaphore CONCURRENT_GATE = new Semaphore(MAX_CONCURRENT_OPS);

    /**
     * Immutable point-in-time snapshot of JVM heap metrics. Capturing all three {@code
     * Runtime.getRuntime()} values in one call prevents the race where {@code freeMemory()} and
     * {@code totalMemory()} are read milliseconds apart under GC pressure, yielding a logically
     * inconsistent picture.
     */
    record MemorySnapshot(long maxBytes, long usedBytes, long freeBytes, double freePct) {

        static MemorySnapshot capture() {
            Runtime rt = Runtime.getRuntime();
            long max = rt.maxMemory();
            long used = rt.totalMemory() - rt.freeMemory();
            long free = max - used;
            return new MemorySnapshot(max, used, free, (double) free / max * 100.0);
        }

        /** {@code true} when available heap is too low for in-memory PDF caching. */
        boolean isLow() {
            return freePct < MIN_FREE_MEMORY_PERCENTAGE || freeBytes < MIN_FREE_MEMORY_FLOOR;
        }
    }

    public PDDocument load(File file) throws IOException {
        return load(file, false);
    }

    /**
     * Loads a PDF from a caller-owned {@link File}. Small files (≤ {@link #SMALL_FILE_THRESHOLD})
     * are slurped into a byte array. Larger files are loaded directly using a non-destructive
     * {@link RandomAccessReadBufferedFile} so the caller's original is never modified or deleted.
     *
     * <p>Note: for files larger than {@link #SMALL_FILE_THRESHOLD}, the returned document holds
     * an open file handle to the original file until {@link PDDocument#close()} is called.
     */
    public PDDocument load(File file, boolean readOnly) throws IOException {
        if (file == null) throw ExceptionUtils.createNullArgumentException("File");
        long size = file.length();
        log.debug("Loading PDF from file: {} MB", size >> 20);
        if (size < SMALL_FILE_THRESHOLD) {
            return load(Files.readAllBytes(file.toPath()), readOnly);
        }
        MemorySnapshot mem = MemorySnapshot.capture();
        // Use the overridable method so that test spies (SpyPDFDocumentFactory) can intercept.
        StreamCacheCreateFunction cache = getStreamCacheFunction(size, mem);
        // Non-destructive — caller's file is never deleted
        RandomAccessReadBufferedFile raf = new RandomAccessReadBufferedFile(file);
        PDDocument doc;
        try {
            doc = Loader.loadPDF(raf, "", null, null, cache);
        } catch (IOException e) {
            try { raf.close(); } catch (IOException ce) { e.addSuppressed(ce); }
            ExceptionUtils.logException("PDF loading from file", e);
            throw ExceptionUtils.handlePdfException(e);
        }
        if (size > LARGE_FILE_THRESHOLD || mem.isLow()) {
            doc.setResourceCache(null);
        }
        try {
            return maybePostProcess(doc, readOnly);
        } catch (IOException | RuntimeException ex) {
            doc.close();
            throw ex;
        }
    }

    public PDDocument load(Path path) throws IOException {
        return load(path, false);
    }

    /** Loads a PDF from a caller-owned {@link Path}. Delegates to {@link #load(File, boolean)}. */
    public PDDocument load(Path path, boolean readOnly) throws IOException {
        if (path == null) throw ExceptionUtils.createNullArgumentException("Path");
        return load(path.toFile(), readOnly);
    }

    public PDDocument load(byte[] input) throws IOException {
        return load(input, false);
    }

    public PDDocument load(byte[] input, boolean readOnly) throws IOException {
        if (input == null) throw ExceptionUtils.createNullArgumentException("Input bytes");
        long size = input.length;
        log.debug("Loading PDF from byte[]: {} MB", size >> 20);
        PDDocument doc = loadAdaptively(input, size, null);
        try {
            return maybePostProcess(doc, readOnly);
        } catch (IOException | RuntimeException ex) {
            doc.close();
            throw ex;
        }
    }

    public PDDocument load(InputStream input) throws IOException {
        return load(input, false);
    }

    public PDDocument load(InputStream input, boolean readOnly) throws IOException {
        if (input == null) throw ExceptionUtils.createNullArgumentException("InputStream");
        return streamToTemp(input, null, readOnly);
    }

    public PDDocument load(InputStream input, String password) throws IOException {
        return load(input, password, false);
    }

    public PDDocument load(InputStream input, String password, boolean readOnly)
            throws IOException {
        if (input == null) throw ExceptionUtils.createNullArgumentException("InputStream");
        return streamToTemp(input, password, readOnly);
    }

    public PDDocument load(String path) throws IOException {
        return load(path, false);
    }

    public PDDocument load(String path, boolean readOnly) throws IOException {
        return load(new File(path), readOnly);
    }

    public PDDocument load(PDFFile pdfFile) throws IOException {
        return load(pdfFile, false);
    }

    public PDDocument load(PDFFile pdfFile, boolean readOnly) throws IOException {
        return load(pdfFile.getFileInput(), readOnly);
    }

    public PDDocument load(MultipartFile pdfFile) throws IOException {
        return load(pdfFile, false);
    }

    /**
     * Loads a {@link MultipartFile}. Small uploads (≤ {@link #SMALL_FILE_THRESHOLD}) are read
     * directly into a byte array, bypassing the InputStream → temp-file round-trip and saving one
     * disk write + read cycle on the hot path.
     */
    public PDDocument load(MultipartFile pdfFile, boolean readOnly) throws IOException {
        long size = pdfFile.getSize();
        if (size > 0 && size <= SMALL_FILE_THRESHOLD) {
            return load(pdfFile.getBytes(), readOnly);
        }
        return streamToTemp(pdfFile.getInputStream(), null, readOnly);
    }

    public PDDocument load(MultipartFile fileInput, String password) throws IOException {
        return load(fileInput, password, false);
    }

    public PDDocument load(MultipartFile fileInput, String password, boolean readOnly)
            throws IOException {
        return streamToTemp(fileInput.getInputStream(), password, readOnly);
    }

    /**
     * Returns the {@link StreamCacheCreateFunction} appropriate for a document of the given byte
     * size given the current heap state. Captures a fresh {@link MemorySnapshot} on each call.
     *
     * <p>Overridden by {@code SpyPDFDocumentFactory} in tests to record which strategy was chosen.
     */
    public StreamCacheCreateFunction getStreamCacheFunction(long contentSize) {
        return getStreamCacheFunction(contentSize, MemorySnapshot.capture());
    }

    /**
     * Overload accepting a pre-captured {@link MemorySnapshot} so that internal callers can reuse
     * a single snapshot for both cache selection and resource-cache decisions. Overridable so that
     * test spies ({@code SpyPDFDocumentFactory}) can intercept.
     */
    protected StreamCacheCreateFunction getStreamCacheFunction(
            long contentSize, MemorySnapshot mem) {
        return selectCacheFunction(contentSize, mem);
    }

    public PDDocument createNewDocument(MemoryUsageSetting settings) throws IOException {
        PDDocument doc = new PDDocument(scratchCache(settings));
        pdfMetadataService.setDefaultMetadata(doc);
        return doc;
    }

    /**
     * Creates a new empty document using a memory-only cache. New documents start at zero bytes, so
     * file-backed scratch space is wasteful until the caller has actually written content. Callers
     * that build very large documents can use {@link #createNewDocument(MemoryUsageSetting)} to opt
     * in to file-backed caching from the start.
     */
    public PDDocument createNewDocument() throws IOException {
        PDDocument doc = new PDDocument(IOUtils.createMemoryOnlyStreamCache());
        pdfMetadataService.setDefaultMetadata(doc);
        return doc;
    }

    /**
     * Serialises a {@link PDDocument} to a byte array. The document is written to a temp file
     * first so that the PDDocument's internal object graph can be GC'd before {@link
     * Files#readAllBytes} allocates the returned byte array, preventing double-peak memory for
     * large documents. The OS buffer cache absorbs the I/O overhead for small documents.
     */
    public byte[] saveToBytes(PDDocument document) throws IOException {
        Path temp = createTempFilePath("pdf-save-");
        try {
            document.save(temp.toFile());
            return Files.readAllBytes(temp);
        } finally {
            try { Files.deleteIfExists(temp); }
            catch (IOException e) { log.warn("Failed to delete temp file: {}", temp, e); }
        }
    }

    public byte[] createNewBytesBasedOnOldDocument(byte[] oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return saveToBytes(document);
        }
    }

    public PDDocument createNewDocumentBasedOnOldDocument(byte[] oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return createNewDocumentBasedOnOldDocument(document);
        }
    }

    public PDDocument createNewDocumentBasedOnOldDocument(File oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return createNewDocumentBasedOnOldDocument(document);
        }
    }

    public PDDocument createNewDocumentBasedOnOldDocument(PDDocument oldDocument)
            throws IOException {
        PDDocument document = createNewDocument();
        try {
            pdfMetadataService.setMetadataToPdf(
                    document, pdfMetadataService.extractMetadataFromPdf(oldDocument), true);
            return document;
        } catch (RuntimeException ex) {
            document.close();
            throw ex;
        }
    }

    public byte[] loadToBytes(File file) throws IOException {
        try (PDDocument document = load(file)) {
            return saveToBytes(document);
        }
    }

    public byte[] loadToBytes(byte[] bytes) throws IOException {
        try (PDDocument document = load(bytes)) {
            return saveToBytes(document);
        }
    }

    /**
     * Loads all {@code files} concurrently, one virtual thread per file. PDF loading is I/O-bound;
     * virtual threads yield their carrier threads during blocking reads, so the JVM can serve other
     * requests while each document is being parsed from disk.
     *
     * <p>Concurrency is bounded by {@link #MAX_CONCURRENT_OPS} to prevent unbounded memory
     * pressure when many files are submitted simultaneously.
     *
     * <p>If any single load fails, all pending tasks are cancelled, any already-open documents are
     * closed, and the first {@link IOException} is rethrown. The caller retains ownership of all
     * returned documents and must close them.
     *
     * @param files ordered list of files to load; the returned list preserves insertion order
     * @throws InterruptedException if the calling thread is interrupted while waiting
     */
    public List<PDDocument> loadAll(List<File> files) throws IOException, InterruptedException {
        List<Callable<PDDocument>> tasks =
                files.stream().<Callable<PDDocument>>map(f -> () -> {
                    CONCURRENT_GATE.acquire();
                    try {
                        return load(f);
                    } finally {
                        CONCURRENT_GATE.release();
                    }
                }).toList();
        return runConcurrently(tasks, CustomPDFDocumentFactory::closeQuietly);
    }

    /**
     * Loads all multipart uploads concurrently, one virtual thread per upload. Small uploads (≤
     * {@link #SMALL_FILE_THRESHOLD}) are read into heap; larger uploads spill to temp files.
     * Concurrency is bounded by {@link #MAX_CONCURRENT_OPS}. Failure semantics are identical to
     * {@link #loadAll(List)}.
     *
     * @param files ordered list of uploads; the returned list preserves insertion order
     * @throws InterruptedException if the calling thread is interrupted while waiting
     */
    public List<PDDocument> loadAllMultipart(List<MultipartFile> files)
            throws IOException, InterruptedException {
        List<Callable<PDDocument>> tasks =
                files.stream().<Callable<PDDocument>>map(f -> () -> {
                    CONCURRENT_GATE.acquire();
                    try {
                        return load(f);
                    } finally {
                        CONCURRENT_GATE.release();
                    }
                }).toList();
        return runConcurrently(tasks, CustomPDFDocumentFactory::closeQuietly);
    }

    /**
     * Serialises all documents to byte arrays concurrently, one virtual thread per document.
     * Concurrency is bounded by {@link #MAX_CONCURRENT_OPS}. Each document is written to a temp
     * file (preventing double-peak-memory, see {@link #saveToBytes}); the concurrent writes
     * proceed in parallel. The returned list preserves insertion order.
     *
     * @throws InterruptedException if the calling thread is interrupted while waiting
     */
    public List<byte[]> saveAllToBytes(List<PDDocument> documents)
            throws IOException, InterruptedException {
        List<Callable<byte[]>> tasks =
                documents.stream().<Callable<byte[]>>map(doc -> () -> {
                    CONCURRENT_GATE.acquire();
                    try {
                        return saveToBytes(doc);
                    } finally {
                        CONCURRENT_GATE.release();
                    }
                }).toList();
        return runConcurrently(tasks, null);
    }

    /**
     * Runs {@code tasks} concurrently on virtual threads (one per task), collecting results in
     * insertion order. The executor is scoped to this call — no shared mutable state between
     * invocations. On any failure: pending tasks are cancelled, {@code onFailureCleanup} is applied
     * to every result collected before the failure, and the first exception is rethrown.
     *
     * @param onFailureCleanup may be {@code null} when no result-level cleanup is needed
     */
    private static <T> List<T> runConcurrently(
            List<Callable<T>> tasks, Consumer<T> onFailureCleanup)
            throws IOException, InterruptedException {
        try (ExecutorService vte = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<T>> futures = tasks.stream().map(vte::submit).toList();
            List<T> results = new ArrayList<>(futures.size());
            try {
                for (Future<T> future : futures) {
                    results.add(future.get());
                }
                return List.copyOf(results);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                futures.forEach(f -> f.cancel(true));
                cleanupFutureResults(futures, onFailureCleanup);
                throw ie;
            } catch (ExecutionException e) {
                futures.forEach(f -> f.cancel(true));
                cleanupFutureResults(futures, onFailureCleanup);
                Throwable cause = e.getCause();
                if (cause instanceof IOException ioe) throw ioe;
                if (cause instanceof InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw ie;
                }
                throw new IOException("Concurrent PDF operation failed", cause);
            }
        }
    }

    /**
     * Cleans up results from concurrent execution on failure. Iterates all completed futures and
     * applies the cleanup function to their results. This is the single source of truth — the
     * formerly separate {@code collectedResults} iteration has been removed to prevent
     * double-closing already-collected results.
     */
    private static <T> void cleanupFutureResults(
            List<Future<T>> futures, Consumer<T> onFailureCleanup) {
        if (onFailureCleanup == null) return;
        for (Future<T> f : futures) {
            if (f.isDone() && !f.isCancelled()) {
                try {
                    onFailureCleanup.accept(f.get());
                } catch (Exception ignored) {
                    // best-effort cleanup
                }
            }
        }
    }

    private static void closeQuietly(PDDocument doc) {
        try {
            doc.close();
        } catch (IOException e) {
            log.warn("Failed to close PDF during error cleanup", e);
        }
    }

    /**
     * Selects a loading strategy and loads the document from {@code source} (a {@link File} or
     * {@code byte[]}). A single {@link MemorySnapshot} is captured once and reused for both cache
     * selection and resource-cache configuration, guaranteeing that both decisions see the same
     * heap state.
     *
     * @param password {@code null} for unencrypted (or to-be-decrypted-later) documents
     */
    private PDDocument loadAdaptively(Object source, long contentSize, String password)
            throws IOException {
        Object sourceObj = source;
        // Capture a single snapshot for both cache selection and resource-cache decision.
        MemorySnapshot mem = MemorySnapshot.capture();
        // Use the overridable method so that test spies (SpyPDFDocumentFactory) can intercept.
        StreamCacheCreateFunction cacheFunction = getStreamCacheFunction(contentSize, mem);

        // Slurp small on-disk files into heap immediately so the temp file can be removed and its
        // file descriptor released before PDFBox opens its own internal scratch space.
        if (contentSize < SMALL_FILE_THRESHOLD && sourceObj instanceof File f) {
            byte[] bytes = Files.readAllBytes(f.toPath());
            Files.deleteIfExists(f.toPath());
            sourceObj = bytes;
        }

        PDDocument document =
                switch (sourceObj) {
                    case File f ->
                            password != null
                                    ? loadFromFileWithPassword(f, cacheFunction, password)
                                    : loadFromFile(f, cacheFunction);
                    case byte[] b ->
                            password != null
                                    ? loadFromBytesWithPassword(
                                            b, contentSize, cacheFunction, password)
                                    : loadFromBytes(b, contentSize, cacheFunction);
                    default ->
                            throw new IllegalArgumentException(
                                    "Unsupported source type: "
                                            + sourceObj.getClass().getSimpleName());
                };

        // Use the same snapshot captured above for consistent resource-cache decision.
        if (contentSize > LARGE_FILE_THRESHOLD || mem.isLow()) {
            document.setResourceCache(null);
        }
        return document;
    }

    /** Buffers an {@link InputStream} to a managed temp file then delegates to the core loader. */
    private PDDocument streamToTemp(InputStream input, String password, boolean readOnly)
            throws IOException {
        Path tempFile = createTempFilePath("pdf-stream-");
        boolean success = false;
        try {
            Files.copy(input, tempFile, StandardCopyOption.REPLACE_EXISTING);
            PDDocument doc = loadAdaptively(tempFile.toFile(), Files.size(tempFile), password);
            try {
                PDDocument result = maybePostProcess(doc, readOnly);
                success = true;
                return result;
            } catch (IOException | RuntimeException ex) {
                doc.close();
                throw ex;
            }
        } finally {
            // On success: small files are deleted inside loadAdaptively; large files are owned by
            // DeletingRandomAccessFile and deleted when the PDDocument closes.
            // On failure: clean up the temp file ourselves since no one else will.
            if (!success) {
                Files.deleteIfExists(tempFile);
            }
        }
    }

    /**
     * Internal helper that reuses an already-captured {@link MemorySnapshot}, avoiding a second
     * {@code Runtime.getRuntime()} call from within the same load operation.
     */
    private static StreamCacheCreateFunction selectCacheFunction(
            long contentSize, MemorySnapshot mem) {
        if (mem.isLow()) {
            log.debug(
                    "Heap pressure ({}% free, {} MB free), forcing file-backed cache",
                    (int) mem.freePct(), mem.freeBytes() >> 20);
            return scratchCache(MemoryUsageSetting.setupTempFileOnly());
        }
        if (contentSize < SMALL_FILE_THRESHOLD) {
            log.debug("Memory-only cache for {} KB document", contentSize >> 10);
            return IOUtils.createMemoryOnlyStreamCache();
        }
        if (contentSize < LARGE_FILE_THRESHOLD) {
            log.debug("Mixed cache for {} MB document", contentSize >> 20);
            return scratchCache(MemoryUsageSetting.setupMixed(MIXED_MODE_MEMORY_LIMIT));
        }
        log.debug("File-backed cache for {} MB document", contentSize >> 20);
        return scratchCache(MemoryUsageSetting.setupTempFileOnly());
    }

    private static PDDocument loadFromFile(File file, StreamCacheCreateFunction cache)
            throws IOException {
        DeletingRandomAccessFile raf = new DeletingRandomAccessFile(file);
        try {
            // Empty string password: PDFBox convention for unencrypted documents.
            return Loader.loadPDF(raf, "", null, null, cache);
        } catch (IOException e) {
            try { raf.close(); } catch (IOException ce) { e.addSuppressed(ce); }
            ExceptionUtils.logException("PDF loading from file", e);
            throw ExceptionUtils.handlePdfException(e);
        }
    }

    /**
     * Loads a password-protected PDF from a file. The {@link DeletingRandomAccessFile} is
     * explicitly closed if {@link Loader#loadPDF} throws to prevent file descriptor leaks.
     */
    private static PDDocument loadFromFileWithPassword(
            File file, StreamCacheCreateFunction cache, String password) throws IOException {
        DeletingRandomAccessFile raf = new DeletingRandomAccessFile(file);
        try {
            return Loader.loadPDF(raf, password, null, null, cache);
        } catch (IOException e) {
            try { raf.close(); } catch (IOException ce) { e.addSuppressed(ce); }
            ExceptionUtils.logException("PDF loading from file with password", e);
            throw ExceptionUtils.handlePdfException(e);
        }
    }

    /**
     * Loads from a byte array. If the array exceeds {@link #SMALL_FILE_THRESHOLD} (which can happen
     * when the caller passes a large byte[] directly through the public API), the bytes are first
     * written to a temp file to limit simultaneous heap pressure.
     */
    private PDDocument loadFromBytes(byte[] bytes, long size, StreamCacheCreateFunction cache)
            throws IOException {
        if (size >= SMALL_FILE_THRESHOLD) {
            log.debug("Spilling {} MB byte[] to temp file before loading", size >> 20);
            Path tmp = createTempFilePath("pdf-bytes-");
            boolean ok = false;
            try {
                Files.write(tmp, bytes);
                PDDocument doc = loadFromFile(tmp.toFile(), cache);
                ok = true;
                return doc;
            } finally {
                if (!ok) Files.deleteIfExists(tmp);
            }
        }
        try {
            return Loader.loadPDF(bytes, "", null, null, cache);
        } catch (IOException e) {
            ExceptionUtils.logException("PDF loading from bytes", e);
            throw ExceptionUtils.handlePdfException(e);
        }
    }

    /**
     * Loads a password-protected PDF from a byte array. Large arrays are spilled to a temp file.
     * The {@link DeletingRandomAccessFile} is explicitly closed if loading throws to prevent file
     * descriptor leaks on Windows.
     */
    private PDDocument loadFromBytesWithPassword(
            byte[] bytes, long size, StreamCacheCreateFunction cache, String password)
            throws IOException {
        if (size >= SMALL_FILE_THRESHOLD) {
            Path tmp = createTempFilePath("pdf-bytes-");
            boolean success = false;
            try {
                Files.write(tmp, bytes);
                DeletingRandomAccessFile raf = new DeletingRandomAccessFile(tmp.toFile());
                try {
                    PDDocument doc = Loader.loadPDF(raf, password, null, null, cache);
                    success = true;
                    return doc;
                } catch (IOException e) {
                    try { raf.close(); } catch (IOException ce) { e.addSuppressed(ce); }
                    throw e;
                }
            } finally {
                if (!success) Files.deleteIfExists(tmp);
            }
        }
        return Loader.loadPDF(bytes, password, null, null, cache);
    }

    private PDDocument maybePostProcess(PDDocument doc, boolean readOnly) throws IOException {
        if (!readOnly) {
            pdfMetadataService.setDefaultMetadata(doc);
            removePassword(doc);
        }
        return doc;
    }

    private static void removePassword(PDDocument document) throws IOException {
        if (document.isEncrypted()) {
            try {
                document.setAllSecurityToBeRemoved(true);
            } catch (RuntimeException e) {
                ExceptionUtils.logException("PDF decryption", e);
                throw new IOException("PDF decryption failed", e);
            }
        }
    }

    private static StreamCacheCreateFunction scratchCache(MemoryUsageSetting settings) {
        return () -> {
            try {
                return new ScratchFile(settings);
            } catch (IOException e) {
                throw new RuntimeException("ScratchFile initialisation failed", e);
            }
        };
    }

    /**
     * Creates a managed temp file. When {@link TempFileManager} is available (production Spring
     * context) it registers the file for automatic cleanup. Falls back to {@link
     * Files#createTempFile} for test environments where the full context is not present; the
     * fallback file is registered for JVM-shutdown deletion.
     */
    private Path createTempFilePath(String prefix) throws IOException {
        if (tempFileManager != null) {
            return tempFileManager.createTempFile(".tmp").toPath();
        }
        Path p = Files.createTempFile(prefix, ".tmp");
        p.toFile().deleteOnExit();
        return p;
    }
}
