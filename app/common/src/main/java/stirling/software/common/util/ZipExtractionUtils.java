package stirling.software.common.util;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import io.github.pixee.security.ZipSecurity;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

/**
 * Helpers for detecting and extracting ZIP-formatted responses returned from Stirling API
 * endpoints. Shared between {@code PipelineProcessor} and {@code AiWorkflowService} so both callers
 * unpack ZIPs consistently (hardened against zip-slip, depth-limited, backed by managed temp
 * files).
 */
@Slf4j
@UtilityClass
public class ZipExtractionUtils {

    private static final int MAX_UNZIP_DEPTH = 10;
    private static final byte[] ZIP_MAGIC = {0x50, 0x4B, 0x03, 0x04};

    /**
     * Returns true if the resource starts with the standard ZIP magic bytes. CBZ files are
     * explicitly treated as non-ZIP.
     */
    public static boolean isZip(Resource data) throws IOException {
        return isZip(data, null);
    }

    /**
     * Returns true if the resource starts with the standard ZIP magic bytes. Files named with the
     * {@code .cbz} extension are excluded (handled separately by the comic viewer).
     */
    public static boolean isZip(Resource data, String filename) throws IOException {
        if (data == null || data.contentLength() < ZIP_MAGIC.length) {
            return false;
        }
        if (filename != null && filename.toLowerCase().endsWith(".cbz")) {
            return false;
        }
        try (InputStream is = data.getInputStream()) {
            byte[] header = new byte[ZIP_MAGIC.length];
            if (is.read(header) < ZIP_MAGIC.length) {
                return false;
            }
            for (int i = 0; i < ZIP_MAGIC.length; i++) {
                if (header[i] != ZIP_MAGIC[i]) {
                    return false;
                }
            }
            return true;
        }
    }

    /**
     * Extract a ZIP resource into a flat list of resources, one per file entry. Nested ZIPs are
     * recursively extracted up to {@link #MAX_UNZIP_DEPTH}. Each entry is materialized as a
     * hardened-extracted managed temp file so downstream consumers can stream the bytes.
     */
    public static List<Resource> extractZip(Resource zip, TempFileManager tempFileManager)
            throws IOException {
        return extractZip(zip, tempFileManager, null);
    }

    /**
     * Extract a ZIP resource into a flat list of resources. Each created {@link TempFile} is also
     * passed to {@code tempFileConsumer} when non-null, giving callers the option to register the
     * temp files with an auxiliary lifecycle (e.g. {@code PipelineResult}).
     */
    public static List<Resource> extractZip(
            Resource zip, TempFileManager tempFileManager, Consumer<TempFile> tempFileConsumer)
            throws IOException {
        return extractZipInternal(zip, tempFileManager, tempFileConsumer, 0);
    }

    private static List<Resource> extractZipInternal(
            Resource zip,
            TempFileManager tempFileManager,
            Consumer<TempFile> tempFileConsumer,
            int depth)
            throws IOException {
        if (depth > MAX_UNZIP_DEPTH) {
            log.warn(
                    "ZIP nesting depth {} exceeds limit {}, treating as file",
                    depth,
                    MAX_UNZIP_DEPTH);
            return List.of(zip);
        }
        log.debug("Unzipping data of length: {}", zip.contentLength());
        List<Resource> extracted = new ArrayList<>();
        try (InputStream bais = zip.getInputStream();
                ZipInputStream zis = ZipSecurity.createHardenedInputStream(bais)) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                TempFile tempFile = tempFileManager.createManagedTempFile("unzip");
                if (tempFileConsumer != null) {
                    tempFileConsumer.accept(tempFile);
                }
                try (OutputStream os = Files.newOutputStream(tempFile.getPath())) {
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = zis.read(buffer)) != -1) {
                        os.write(buffer, 0, count);
                    }
                }
                final String filename = entry.getName();
                Resource fileResource =
                        new FileSystemResource(tempFile.getFile()) {
                            @Override
                            public String getFilename() {
                                return filename;
                            }
                        };
                if (isZip(fileResource, filename)) {
                    log.debug("Nested ZIP entry {} — recursing", filename);
                    extracted.addAll(
                            extractZipInternal(
                                    fileResource, tempFileManager, tempFileConsumer, depth + 1));
                } else {
                    extracted.add(fileResource);
                }
            }
        }
        log.debug("Unzipping completed. {} files extracted.", extracted.size());
        return extracted;
    }
}
