package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.atomic.AtomicLong;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.examples.util.DeletingRandomAccessFile;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFFile;

/**
 * Adaptive PDF document factory that optimizes memory usage based on file size and available system
 * resources.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CustomPDFDocumentFactory {

    private final PdfMetadataService pdfMetadataService;

    // Memory thresholds and limits

    private static final long SMALL_FILE_THRESHOLD = 10 * 1024 * 1024; // 10 MB
    // Files smaller than this threshold are loaded entirely in memory for better performance.
    // These files use IOUtils.createMemoryOnlyStreamCache() which keeps all document data in RAM.
    // No temp files are created for document data, reducing I/O operations but consuming more
    // memory.

    private static final long LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB
    // Files between SMALL and LARGE thresholds use file-based caching with ScratchFile,
    // but are loaded directly from byte arrays if provided that way.
    // When loading from byte arrays, once size exceeds this threshold, bytes are first
    // written to temp files before loading to reduce memory pressure.

    private static final long LARGE_FILE_USAGE = 10 * 1024 * 1024;

    private static final long EXTREMELY_LARGE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
    // Files exceeding this threshold use specialized loading with RandomAccessReadBufferedFile
    // which provides buffered access to the file without loading the entire content at once.
    // These files are always processed using file-based caching with minimal memory footprint,
    // trading some performance for significantly reduced memory usage.
    // For extremely large PDFs, this prevents OutOfMemoryErrors at the cost of being more I/O
    // bound.

    private static final double MIN_FREE_MEMORY_PERCENTAGE = 30.0; // 30%
    private static final long MIN_FREE_MEMORY_BYTES = 4L * 1024 * 1024 * 1024; // 4 GB

    // Counter for tracking temporary resources
    private static final AtomicLong tempCounter = new AtomicLong(0);

    /**
     * Main entry point for loading a PDF document from a file. Automatically selects the most
     * appropriate loading strategy.
     */
    public PDDocument load(File file) throws IOException {
        return load(file, false);
    }

    /**
     * Main entry point for loading a PDF document from a file with read-only option. Automatically
     * selects the most appropriate loading strategy.
     */
    public PDDocument load(File file, boolean readOnly) throws IOException {
        if (file == null) {
            throw new IllegalArgumentException("File cannot be null");
        }

        long fileSize = file.length();
        log.debug("Loading PDF from file, size: {}MB", fileSize / (1024 * 1024));

        PDDocument doc = loadAdaptively(file, fileSize);
        if (!readOnly) {
            postProcessDocument(doc);
        }
        return doc;
    }

    /**
     * Main entry point for loading a PDF document from a Path. Automatically selects the most
     * appropriate loading strategy.
     */
    public PDDocument load(Path path) throws IOException {
        return load(path, false);
    }

    /**
     * Main entry point for loading a PDF document from a Path with read-only option. Automatically
     * selects the most appropriate loading strategy.
     */
    public PDDocument load(Path path, boolean readOnly) throws IOException {
        if (path == null) {
            throw new IllegalArgumentException("File cannot be null");
        }

        long fileSize = Files.size(path);
        log.debug("Loading PDF from file, size: {}MB", fileSize / (1024 * 1024));

        PDDocument doc = loadAdaptively(path.toFile(), fileSize);
        if (!readOnly) {
            postProcessDocument(doc);
        }
        return doc;
    }

    /** Load a PDF from byte array with automatic optimization. */
    public PDDocument load(byte[] input) throws IOException {
        return load(input, false);
    }

    /** Load a PDF from byte array with automatic optimization and read-only option. */
    public PDDocument load(byte[] input, boolean readOnly) throws IOException {
        if (input == null) {
            throw new IllegalArgumentException("Input bytes cannot be null");
        }

        long dataSize = input.length;
        log.debug("Loading PDF from byte array, size: {}MB", dataSize / (1024 * 1024));

        PDDocument doc = loadAdaptively(input, dataSize);
        if (!readOnly) {
            postProcessDocument(doc);
        }
        return doc;
    }

    /** Load a PDF from InputStream with automatic optimization. */
    public PDDocument load(InputStream input) throws IOException {
        return load(input, false);
    }

    /** Load a PDF from InputStream with automatic optimization and read-only option. */
    public PDDocument load(InputStream input, boolean readOnly) throws IOException {
        if (input == null) {
            throw new IllegalArgumentException("InputStream cannot be null");
        }

        // Since we don't know the size upfront, buffer to a temp file
        Path tempFile = createTempFile("pdf-stream-");

        Files.copy(input, tempFile, StandardCopyOption.REPLACE_EXISTING);
        PDDocument doc = loadAdaptively(tempFile.toFile(), Files.size(tempFile));
        if (!readOnly) {
            postProcessDocument(doc);
        }
        return doc;
    }

    /** Load with password from InputStream */
    public PDDocument load(InputStream input, String password) throws IOException {
        return load(input, password, false);
    }

    /** Load with password from InputStream and read-only option */
    public PDDocument load(InputStream input, String password, boolean readOnly)
            throws IOException {
        if (input == null) {
            throw new IllegalArgumentException("InputStream cannot be null");
        }

        // Since we don't know the size upfront, buffer to a temp file
        Path tempFile = createTempFile("pdf-stream-");

        Files.copy(input, tempFile, StandardCopyOption.REPLACE_EXISTING);
        PDDocument doc =
                loadAdaptivelyWithPassword(tempFile.toFile(), Files.size(tempFile), password);
        if (!readOnly) {
            postProcessDocument(doc);
        }
        return doc;
    }

    /** Load from a file path string */
    public PDDocument load(String path) throws IOException {
        return load(path, false);
    }

    /** Load from a file path string with read-only option */
    public PDDocument load(String path, boolean readOnly) throws IOException {
        return load(new File(path), readOnly);
    }

    /** Load from a PDFFile object */
    public PDDocument load(PDFFile pdfFile) throws IOException {
        return load(pdfFile, false);
    }

    /** Load from a PDFFile object with read-only option */
    public PDDocument load(PDFFile pdfFile, boolean readOnly) throws IOException {
        return load(pdfFile.getFileInput(), readOnly);
    }

    /** Load from a MultipartFile */
    public PDDocument load(MultipartFile pdfFile) throws IOException {
        return load(pdfFile, false);
    }

    /** Load from a MultipartFile with read-only option */
    public PDDocument load(MultipartFile pdfFile, boolean readOnly) throws IOException {
        return load(pdfFile.getInputStream(), readOnly);
    }

    /** Load with password from MultipartFile */
    public PDDocument load(MultipartFile fileInput, String password) throws IOException {
        return load(fileInput, password, false);
    }

    /** Load with password from MultipartFile with read-only option */
    public PDDocument load(MultipartFile fileInput, String password, boolean readOnly)
            throws IOException {
        return load(fileInput.getInputStream(), password, readOnly);
    }

    /**
     * Determine the appropriate caching strategy based on file size and available memory. This
     * common method is used by both password and non-password loading paths.
     */
    public StreamCacheCreateFunction getStreamCacheFunction(long contentSize) {
        long maxMemory = Runtime.getRuntime().maxMemory();
        long freeMemory = Runtime.getRuntime().freeMemory();
        long totalMemory = Runtime.getRuntime().totalMemory();
        long usedMemory = totalMemory - freeMemory;

        // Calculate percentage of free memory
        double freeMemoryPercent = (double) (maxMemory - usedMemory) / maxMemory * 100;
        long actualFreeMemory = maxMemory - usedMemory;

        // Log memory status
        log.debug(
                "Memory status - Free: {}MB ({}%), Used: {}MB, Max: {}MB",
                actualFreeMemory / (1024 * 1024),
                String.format("%.2f", freeMemoryPercent),
                usedMemory / (1024 * 1024),
                maxMemory / (1024 * 1024));

        // If free memory is critically low, always use file-based caching
        if (freeMemoryPercent < MIN_FREE_MEMORY_PERCENTAGE
                || actualFreeMemory < MIN_FREE_MEMORY_BYTES) {
            log.debug(
                    "Low memory detected ({}%), forcing file-based cache",
                    String.format("%.2f", freeMemoryPercent));
            return createScratchFileCacheFunction(MemoryUsageSetting.setupTempFileOnly());
        } else if (contentSize < SMALL_FILE_THRESHOLD) {
            log.debug("Using memory-only cache for small document ({}KB)", contentSize / 1024);
            return IOUtils.createMemoryOnlyStreamCache();
        } else if (contentSize < LARGE_FILE_THRESHOLD) {
            // For medium files (10-50MB), use a mixed approach
            log.debug(
                    "Using mixed memory/file cache for medium document ({}MB)",
                    contentSize / (1024 * 1024));
            return createScratchFileCacheFunction(MemoryUsageSetting.setupMixed(LARGE_FILE_USAGE));
        } else {
            log.debug("Using file-based cache for large document");
            return createScratchFileCacheFunction(MemoryUsageSetting.setupTempFileOnly());
        }
    }

    /** Update the existing loadAdaptively method to use the common function */
    private PDDocument loadAdaptively(Object source, long contentSize) throws IOException {
        // Get the appropriate caching strategy
        StreamCacheCreateFunction cacheFunction = getStreamCacheFunction(contentSize);

        // If small handle as bytes and remove original file
        if (contentSize <= SMALL_FILE_THRESHOLD && source instanceof File file) {
            source = Files.readAllBytes(file.toPath());
            file.delete();
        }
        PDDocument document;
        if (source instanceof File file) {
            document = loadFromFile(file, contentSize, cacheFunction);
        } else if (source instanceof byte[] bytes) {
            document = loadFromBytes(bytes, contentSize, cacheFunction);
        } else {
            throw new IllegalArgumentException("Unsupported source type: " + source.getClass());
        }
        return document;
    }

    /** Load a PDF with password protection using adaptive loading strategies */
    private PDDocument loadAdaptivelyWithPassword(Object source, long contentSize, String password)
            throws IOException {
        // Get the appropriate caching strategy
        StreamCacheCreateFunction cacheFunction = getStreamCacheFunction(contentSize);
        // If small handle as bytes and remove original file
        if (contentSize <= SMALL_FILE_THRESHOLD && source instanceof File file) {
            source = Files.readAllBytes(file.toPath());
            file.delete();
        }
        PDDocument document;
        if (source instanceof File file) {
            document = loadFromFileWithPassword(file, contentSize, cacheFunction, password);
        } else if (source instanceof byte[] bytes) {
            document = loadFromBytesWithPassword(bytes, contentSize, cacheFunction, password);
        } else {
            throw new IllegalArgumentException("Unsupported source type: " + source.getClass());
        }
        return document;
    }

    /** Load a file with password */
    private PDDocument loadFromFileWithPassword(
            File file, long size, StreamCacheCreateFunction cache, String password)
            throws IOException {
        return Loader.loadPDF(new DeletingRandomAccessFile(file), password, null, null, cache);
    }

    /** Load bytes with password */
    private PDDocument loadFromBytesWithPassword(
            byte[] bytes, long size, StreamCacheCreateFunction cache, String password)
            throws IOException {
        if (size >= SMALL_FILE_THRESHOLD) {
            log.debug("Writing large byte array to temp file for password-protected PDF");
            Path tempFile = createTempFile("pdf-bytes-");

            Files.write(tempFile, bytes);
            return Loader.loadPDF(tempFile.toFile(), password, null, null, cache);
        }
        return Loader.loadPDF(bytes, password, null, null, cache);
    }

    private StreamCacheCreateFunction createScratchFileCacheFunction(MemoryUsageSetting settings) {
        return () -> {
            try {
                return new ScratchFile(settings);
            } catch (IOException e) {
                throw new RuntimeException("ScratchFile initialization failed", e);
            }
        };
    }

    private void postProcessDocument(PDDocument doc) throws IOException {
        pdfMetadataService.setDefaultMetadata(doc);
        removePassword(doc);
    }

    private PDDocument loadFromFile(File file, long size, StreamCacheCreateFunction cache)
            throws IOException {
        return Loader.loadPDF(new DeletingRandomAccessFile(file), "", null, null, cache);
    }

    private PDDocument loadFromBytes(byte[] bytes, long size, StreamCacheCreateFunction cache)
            throws IOException {
        if (size >= SMALL_FILE_THRESHOLD) {
            log.debug("Writing large byte array to temp file");
            Path tempFile = createTempFile("pdf-bytes-");

            Files.write(tempFile, bytes);
            return loadFromFile(tempFile.toFile(), size, cache);
        }
        return Loader.loadPDF(bytes, "", null, null, cache);
    }

    public PDDocument createNewDocument(MemoryUsageSetting settings) throws IOException {
        PDDocument doc = new PDDocument(createScratchFileCacheFunction(settings));
        pdfMetadataService.setDefaultMetadata(doc);
        return doc;
    }

    public PDDocument createNewDocument() throws IOException {
        return createNewDocument(MemoryUsageSetting.setupTempFileOnly());
    }

    public byte[] saveToBytes(PDDocument document) throws IOException {
        if (document.getNumberOfPages() < 10) { // Simple heuristic
            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                return baos.toByteArray();
            }
        } else {
            Path tempFile = createTempFile("pdf-save-");

            document.save(tempFile.toFile());
            return Files.readAllBytes(tempFile);
        }
    }

    // Improved password handling
    private void removePassword(PDDocument document) throws IOException {
        if (document.isEncrypted()) {
            try {
                document.setAllSecurityToBeRemoved(true);
            } catch (Exception e) {
                log.error("Decryption failed", e);
                throw new IOException("PDF decryption failed", e);
            }
        }
    }

    // Temp file handling with enhanced logging
    private Path createTempFile(String prefix) throws IOException {
        Path file = Files.createTempFile(prefix + tempCounter.incrementAndGet() + "-", ".tmp");
        log.debug("Created temp file: {}", file);
        return file;
    }

    /** Create a uniquely named temporary directory */
    private Path createTempDirectory(String prefix) throws IOException {
        return Files.createTempDirectory(prefix + tempCounter.incrementAndGet() + "-");
    }

    /** Create new document bytes based on an existing document */
    public byte[] createNewBytesBasedOnOldDocument(byte[] oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return saveToBytes(document);
        }
    }

    /** Create new document bytes based on an existing document file */
    public byte[] createNewBytesBasedOnOldDocument(File oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return saveToBytes(document);
        }
    }

    /** Create new document bytes based on an existing PDDocument */
    public byte[] createNewBytesBasedOnOldDocument(PDDocument oldDocument) throws IOException {
        pdfMetadataService.setMetadataToPdf(
                oldDocument, pdfMetadataService.extractMetadataFromPdf(oldDocument), true);
        return saveToBytes(oldDocument);
    }

    /** Create a new document based on an existing document bytes */
    public PDDocument createNewDocumentBasedOnOldDocument(byte[] oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return createNewDocumentBasedOnOldDocument(document);
        }
    }

    /** Create a new document based on an existing document file */
    public PDDocument createNewDocumentBasedOnOldDocument(File oldDocument) throws IOException {
        try (PDDocument document = load(oldDocument)) {
            return createNewDocumentBasedOnOldDocument(document);
        }
    }

    /** Create a new document based on an existing PDDocument */
    public PDDocument createNewDocumentBasedOnOldDocument(PDDocument oldDocument)
            throws IOException {
        PDDocument document = createNewDocument();
        pdfMetadataService.setMetadataToPdf(
                document, pdfMetadataService.extractMetadataFromPdf(oldDocument), true);
        return document;
    }

    /** Load document from a file and convert it to bytes */
    public byte[] loadToBytes(File file) throws IOException {
        try (PDDocument document = load(file)) {
            return saveToBytes(document);
        }
    }

    /** Load document from bytes and convert it back to bytes */
    public byte[] loadToBytes(byte[] bytes) throws IOException {
        try (PDDocument document = load(bytes)) {
            return saveToBytes(document);
        }
    }
}
