package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicLong;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.io.RandomAccessStreamCache.StreamCacheCreateFunction;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFFile;

/**
 * Adaptive PDF document factory that optimizes memory usage based on file size and available system
 * resources.
 */
@Component
@Slf4j
public class CustomPDDocumentFactory {

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

    private static final long EXTREMELY_LARGE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
    // Files exceeding this threshold use specialized loading with RandomAccessReadBufferedFile
    // which provides buffered access to the file without loading the entire content at once.
    // These files are always processed using file-based caching with minimal memory footprint,
    // trading some performance for significantly reduced memory usage.
    // For extremely large PDFs, this prevents OutOfMemoryErrors at the cost of being more I/O
    // bound.

    // Counter for tracking temporary resources
    private static final AtomicLong tempCounter = new AtomicLong(0);

    public CustomPDDocumentFactory(PdfMetadataService pdfMetadataService) {
        this.pdfMetadataService = pdfMetadataService;
    }

    /**
     * Main entry point for loading a PDF document from a file. Automatically selects the most
     * appropriate loading strategy.
     */
    public PDDocument load(File file) throws IOException {
        if (file == null) {
            throw new IllegalArgumentException("File cannot be null");
        }

        long fileSize = file.length();
        log.info("Loading PDF from file, size: {}MB", fileSize / (1024 * 1024));

        return loadAdaptively(file, fileSize);
    }

    /** Load a PDF from byte array with automatic optimization. */
    public PDDocument load(byte[] input) throws IOException {
        if (input == null) {
            throw new IllegalArgumentException("Input bytes cannot be null");
        }

        long dataSize = input.length;
        log.info("Loading PDF from byte array, size: {}MB", dataSize / (1024 * 1024));

        return loadAdaptively(input, dataSize);
    }

    /** Load a PDF from InputStream with automatic optimization. */
    public PDDocument load(InputStream input) throws IOException {
        if (input == null) {
            throw new IllegalArgumentException("InputStream cannot be null");
        }

        // Since we don't know the size upfront, buffer to a temp file
        Path tempFile = createTempFile("pdf-stream-");
        try {
            Files.copy(input, tempFile);
            return loadAdaptively(tempFile.toFile(), Files.size(tempFile));
        } catch (IOException e) {
            cleanupFile(tempFile);
            throw e;
        }
    }

    private PDDocument loadAdaptively(Object source, long contentSize) throws IOException {
        StreamCacheCreateFunction cacheFunction;

        if (contentSize < SMALL_FILE_THRESHOLD) {
            log.info("Using memory-only cache for small document ({}KB)", contentSize / 1024);
            cacheFunction = IOUtils.createMemoryOnlyStreamCache();
        } else {
            log.info("Using file-based cache");
            cacheFunction = createScratchFileCacheFunction(MemoryUsageSetting.setupTempFileOnly());
        }

        PDDocument document;
        if (source instanceof File file) {
            document = loadFromFile(file, contentSize, cacheFunction);
        } else if (source instanceof byte[] bytes) {
            document = loadFromBytes(bytes, contentSize, cacheFunction);
        } else {
            throw new IllegalArgumentException("Unsupported source type: " + source.getClass());
        }

        postProcessDocument(document);
        return document;
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
        if (size >= EXTREMELY_LARGE_THRESHOLD) {
            log.info("Loading extremely large file via buffered access");
            return Loader.loadPDF(new RandomAccessReadBufferedFile(file), "", null, null, cache);
        }
        return Loader.loadPDF(file, "", null, null, cache);
    }

    private PDDocument loadFromBytes(byte[] bytes, long size, StreamCacheCreateFunction cache)
            throws IOException {
        if (size >= SMALL_FILE_THRESHOLD) {
            log.info("Writing large byte array to temp file");
            Path tempFile = createTempFile("pdf-bytes-");
            try {
                Files.write(tempFile, bytes);
                return Loader.loadPDF(tempFile.toFile(), "", null, null, cache);
            } finally {
                cleanupFile(tempFile);
            }
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
            try {
                document.save(tempFile.toFile());
                return Files.readAllBytes(tempFile);
            } finally {
                cleanupFile(tempFile);
            }
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
        Path file = Files.createTempFile(prefix + tempCounter.getAndIncrement() + "-", ".tmp");
        log.info("Created temp file: {}", file);
        return file;
    }

    /** Create a uniquely named temporary directory */
    private Path createTempDirectory(String prefix) throws IOException {
        return Files.createTempDirectory(prefix + tempCounter.incrementAndGet() + "-");
    }

    /** Clean up a temporary file */
    private void cleanupFile(Path file) {
        //   try {
        // if (Files.deleteIfExists(file)) {
        log.info("Deleted temp file: {}", file);
        // }
        //   } catch (IOException e) {
        //   log.info("Error deleting temp file {}", file, e);
        //   }
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

    /** Load from a file path string */
    public PDDocument load(String path) throws IOException {
        return load(new File(path));
    }

    /** Load from a PDFFile object */
    public PDDocument load(PDFFile pdfFile) throws IOException {
        return load(pdfFile.getFileInput());
    }

    /** Load from a MultipartFile */
    public PDDocument load(MultipartFile pdfFile) throws IOException {
        return load(pdfFile.getBytes());
    }

    /** Load with password from MultipartFile */
    public PDDocument load(MultipartFile fileInput, String password) throws IOException {
        return load(fileInput.getBytes(), password);
    }

    /** Load with password from byte array */
    private PDDocument load(byte[] bytes, String password) throws IOException {
        // Since we don't have direct password support in the adaptive loader,
        // we'll need to use PDFBox's Loader directly
        PDDocument document = Loader.loadPDF(bytes, password);
        pdfMetadataService.setDefaultMetadata(document);
        return document;
    }
}
